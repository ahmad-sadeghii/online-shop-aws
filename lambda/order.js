const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const crypto= require("crypto");
const Handlebars = require('handlebars');
const ses = new AWS.SES();
const sns = new AWS.SNS();
import orderReceivedEmail from './templates/order-received-email.html';
import shipmentApprovalNotification from './templates/shipment-approval-request.txt';

exports.handler = async (event) => {
    console.log("New Event:", event);
    const customerEmail = event.identity.claims.email;
    const { input: { Country, City, County, Street, Details } } = event.arguments;
    const { username, sub } = event.identity;

    const orderDate = new Date();


    const id = crypto.createHash('sha256').update(customerEmail + Date.now()).digest('hex');

    const order = {
        pk: `ORDER#`,
        sk: `ORDER#${id}`,
        Id: id,
        CustomerId: sub,
        CustomerEmail: customerEmail,
        AddressCountry: Country,
        AddressCity: City,
        AddressCounty: County,
        AddressStreet: Street,
        CreatedAt: orderDate.toISOString(),
        gs1pk: "ORDERSBYDATE",
        gs1sk: `ORDERDATE#${orderDate.toISOString().split('T')[0]}`,
    };

    const orderDetailsItems = Details.map((detail, index) => ({
        pk: `ORDERDETAIL#`,
        sk: `ORDERDETAIL#${id}#${index}`,
        OrderId: id,
        ProductId: detail.ProductId,
        Quantity: detail.Quantity,
        gs1pk: `ORDERBYDATE`,
        gs1sk: `ORDERDETAIL#${orderDate.toISOString().split('T')[0]}`,
    }));

    const params = {
        RequestItems: {
            [process.env.SINGLE_TABLE_NAME]: [
                { PutRequest: { Item: order } },
                ...orderDetailsItems.map(detail => ({ PutRequest: { Item: detail } })),
            ],
        },
    };

    await dynamoDB.batchWrite(params).promise();

    const compiledTemplate = Handlebars.compile(orderReceivedEmail);

    // Construct BatchGetItem parameters
    const keys = Details.map(detail => ({
        pk: `PRODUCT#`,
        sk: `PRODUCT#${detail.ProductId}`
    }));

    const getProductParams = {
        RequestItems: {
            [process.env.SINGLE_TABLE_NAME]: {
                Keys: keys
            }
        }
    };

    // Step 2: Call batchGetItem
    const result = await dynamoDB.batchGet(getProductParams).promise();
    const items = result.Responses[process.env.SINGLE_TABLE_NAME];

    const productNames = items.reduce((acc, item) => {
        const { Id, Name } = item;
        acc[Id] = Name;
        return acc;
    }, {});

    const data = {
        order_id: id,
        customer_name: username,
        customer_email: customerEmail,
        shipping_address: `${Street}, ${County}, ${City}, ${Country}`,
        order_details: Details.map(detail => ({ "product_name": productNames[detail.ProductId], quantity: detail.Quantity })),
        total_amount: items.reduce((sum, item) => sum + item.Price, 0) + " EUR",
    };

    const htmlContent = compiledTemplate(data);

    const emailParams = {
        Source: "ahmad.sadeghi@trilogy.com",
        Destination: {
            ToAddresses: [
                customerEmail,
            ],
        },
        Message: {
            Subject: {
                Data: "Order Confirmation",
                Charset: "UTF-8",
            },
            Body: {
                Html: {
                    Data: htmlContent,
                    Charset: "UTF-8",
                },
            },
        },
    };

    await ses.sendEmail(emailParams).promise();

    const stepFunctions = new AWS.StepFunctions();
    const executionParams = {
        stateMachineArn: process.env.ORDER_APPROVAL_STATE_MACHINE_ARN,
        input: JSON.stringify({
            orderId: id,
            customerName: username
        }),
    };

    await stepFunctions.startExecution(executionParams).promise();

    return order;
};
