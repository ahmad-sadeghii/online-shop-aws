import * as aws from 'aws-sdk';
import { Callback, Context } from 'aws-lambda';
import Handlebars from "handlebars";
import emailTemplate from "./templates/shipment-rejected-email.html";

const dynamoDB = new aws.DynamoDB.DocumentClient();
const stepfunctions = new aws.StepFunctions();
const ses = new aws.SES();

export const handler = async (event: any, context: Context, callback: Callback) => {
    console.log("Received Event:", event);
    const { orderId, customerEmail } = event;

    // Delete order from DynamoDB and send cancellation email
    const deleteParams = {
        TableName: process.env.SINGLE_TABLE_NAME!,
        Key: { pk: `ORDER#`, sk: `ORDER#${orderId}` },
    };

    await dynamoDB.delete(deleteParams).promise();

    const compiledTemplate = Handlebars.compile(emailTemplate);

    const data = {
        orderId,
        customerName: customerEmail,
    };

    console.log("Data:", data);

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
                Data: "Order Rejection",
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

};
