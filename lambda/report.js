const AWS = require('aws-sdk');
const Handlebars = require('handlebars');
import puppeteer from "puppeteer-core";
const chromium = require("@sparticuz/chromium");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
import reportEmailTemplate from './templates/daily-order-report.html';

async function getOrdersFromOrderDetails(dateString) {
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

async function getProductsFromOrderDetails(orderDetails) {
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
async function generateReportHTML(reportData) {
    const template = Handlebars.compile(reportEmailTemplate);
    return template(reportData);
}

async function storeDataForNotification(reportData) {
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

async function generatePDF(html) {
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

async function storeReport(pdf, fileName) {
    const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: fileName,
        Body: pdf,
        ContentType: 'application/pdf',
    };
    return s3.putObject(params).promise();
}

exports.handler = async (event) => {
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
        const orderDetails = data.Items;

        if (orderDetails.length > 0) {
            // Getting orders categorized by their ID
            const orders = await getOrdersFromOrderDetails(dateString);

            // Getting products categorized by their ID
            const products = await getProductsFromOrderDetails(orderDetails);

            const reportData = {
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
