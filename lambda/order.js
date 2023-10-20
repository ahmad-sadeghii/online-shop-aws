const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const crypto = require("crypto");

exports.handler = async (event) => {
    console.log("New Event:", event);
    const customerEmail = event.identity.claims.email;
    const { input: { Country, City, County, Street, Details } } = event.arguments;

    const orderDate = new Date();


    const id = crypto.createHash('sha256').update(customerEmail + Date.now()).digest('hex');

    const order = {
        pk: `ORDER#`,
        sk: `ORDER#${id}`,
        Id: id,
        CustomerEmail: customerEmail,
        AddressCountry: Country,
        AddressCity: City,
        AddressCounty: County,
        AddressStreet: Street,
        CreatedAt: orderDate.toISOString(),
        gs1pk: "ORDERSBYDATE",
        gs1sk: `ORDERDATE#${orderDate.getDate().toString()}`,
    };

    const orderDetailsItems = Details.map((detail, index) => ({
        pk: `ORDERDETAIL#`,
        sk: `ORDERDETAIL#${id}#${index}`,
        OrderId: id,
        ProductId: detail.ProductId,
        Quantity: detail.Quantity,
        gs1pk: `ORDER#${id}`,
        gs1sk: `DETAIL#${id}#${index}`,
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

    console.log(order);

    return order;
};
