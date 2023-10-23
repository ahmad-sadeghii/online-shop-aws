import { DynamoDB, S3 } from 'aws-sdk';
import Handlebars from 'handlebars';
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import reportEmailTemplate from './templates/daily-order-report.html';

const dynamoDB = new DynamoDB.DocumentClient();
const s3 = new S3();

interface OrderDetail {
    OrderId: string;
    ProductId: string;
    Quantity: number;
}

interface Product {
    Id: string;
    Name: string;
    Price: number;
}

interface ReportData {
    currentDate: string;
    orders?: Array<{
        customerId: string;
        email: string;
        shippingAddress: string;
        productName: string;
        quantity: number;
        pricePerItem: number;
        totalPrice: number;
    }>;
    grandTotal?: number;
}

exports.handler = async (event: any): Promise<void> => {
    const yesterday = new Date(Date.now() - 86400000);  // 86400000 ms in a day
    const dateString = yesterday.toISOString().split('T')[0];

    const queryParams = {
        TableName: process.env.SINGLE_TABLE_NAME,
        IndexName: 'gs1',
        KeyConditionExpression: 'gs1pk = :gs1pk AND gs1sk = :gs1sk',
        ExpressionAttributeValues: {
            ':gs1pk': 'ORDERBYDATE',
            ':gs1sk': `ORDERDETAIL#${dateString}`,
        },
    };

    try {
        const data = await dynamoDB.query(queryParams).promise();
        const orderDetails = data.Items as OrderDetail[];

        if (orderDetails.length > 0) {
            // Getting orders categorized by their ID
            const orders = await getOrdersFromOrderDetails(dateString);

            // Getting products categorized by their ID
            const products = await getProductsFromOrderDetails(orderDetails);

            const reportData: ReportData = {
                currentDate: dateString
            };

            reportData.orders = orderDetails.map(detail => ({
                customerId: orders[detail.OrderId]?.CustomerId,
                email: orders[detail.OrderId]?.CustomerEmail,
                shippingAddress: orders[detail.OrderId]?.Address,
                productName: products[detail.ProductId]?.Name,
                quantity: detail.Quantity,
                pricePerItem: products[detail.ProductId]?.Price,
                totalPrice: parseFloat((products[detail.ProductId]?.Price * detail.Quantity).toFixed(2))
            }));

            reportData.grandTotal = parseFloat(reportData.orders.reduce((sum, report) => parseFloat(sum) + parseFloat(report.totalPrice), 0).toFixed(2));

            console.log(reportData);

            const html = await generateReportHTML(reportData);
            const pdf = await generatePDF(html);
            const fileName = `reports/report-${dateString}.pdf`;

            await storeDataForNotification(reportData);

            await storeReport(pdf, fileName);
            console.log('Report generated and stored in S3 successfully');

        } else {
            console.log(`No orders found for the specified date ${dateString}`);
        }
    } catch (error) {
        console.error('Error generating report:', error);
        throw new Error(error);
    }
};

async function getOrdersFromOrderDetails(dateString: string): Promise<{ [key: string]: { CustomerId: string, CustomerEmail: string, Address: string } }> {
    const orderQueryParams = {
        TableName: process.env.SINGLE_TABLE_NAME,
        IndexName: 'gs1',
        KeyConditionExpression: 'gs1pk = :gs1pk AND gs1sk = :gs1sk',
        ExpressionAttributeValues: {
            ':gs1pk': 'ORDERSBYDATE',
            ':gs1sk': `ORDERDATE#${dateString}`,
        },
    };

    const orderData = await dynamoDB.query(orderQueryParams).promise();
    const rawOrders = orderData.Items;

    return rawOrders.reduce((acc, item) => {
        const { Id, CustomerEmail, CustomerId, AddressCountry, AddressCity, AddressCounty, AddressStreet } = item;
        acc[Id] = {
            CustomerId,
            CustomerEmail,
            Address: `${AddressStreet}, ${AddressCounty}, ${AddressCity}, ${AddressCountry}`
        };
        return acc;
    }, {});
}

async function getProductsFromOrderDetails(orderDetails: OrderDetail[]): Promise<{ [key: string]: Product }> {
    const seenProductIds = new Set();
    const productKeys = [];

    orderDetails.forEach(detail => {
        const productId = detail.ProductId;
        if (!seenProductIds.has(productId)) {
            productKeys.push({
                pk: `PRODUCT#`,
                sk: `PRODUCT#${productId}`
            });
            seenProductIds.add(productId);
        }
    });

    console.log("Order details:", orderDetails);
    console.log("Product Keys:", productKeys);

    const getProductParams = {
        RequestItems: {
            [process.env.SINGLE_TABLE_NAME]: {
                Keys: productKeys
            }
        }
    };

    // Step 2: Call batchGetItem
    const productResult = await dynamoDB.batchGet(getProductParams).promise();
    const rawProducts = productResult.Responses[process.env.SINGLE_TABLE_NAME];

    return rawProducts.reduce((acc, item) => {
        const { Id, Name, Price } = item;
        acc[Id] = { Name, Price };
        return acc;
    }, {});
}

async function generateReportHTML(reportData: ReportData): Promise<string> {
    const template = Handlebars.compile(reportEmailTemplate);
    return template(reportData);
}

async function storeDataForNotification(reportData: ReportData): Promise<void> {
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Item: {
            pk: "REPORTDATA#",
            sk: "REPORTDATA#",
            ReportDate: reportData.currentDate,
            TotalOrders: reportData.orders.length,
            GrandTotal: reportData.grandTotal
        }
    };

    await dynamoDB.put(params).promise();
}

async function generatePDF(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
        defaultViewport: chromium.defaultViewport,
        args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    });
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({ format: 'A4' });
    await browser.close();
    return pdf;
}

async function storeReport(pdf: Buffer, fileName: string): Promise<void> {
    const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: fileName,
        Body: pdf,
        ContentType: 'application/pdf',
    };
    return s3.putObject(params).promise();
}
