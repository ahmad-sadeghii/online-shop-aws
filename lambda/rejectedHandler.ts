import * as aws from 'aws-sdk';
import { Callback, Context } from 'aws-lambda';

const dynamoDB = new aws.DynamoDB.DocumentClient();
const stepfunctions = new aws.StepFunctions();
const ses = new aws.SES();

export const handler = async (event: any, context: Context, callback: Callback) => {
    const { orderId, taskToken } = event;

    // Delete order from DynamoDB and send cancellation email
    const deleteParams = {
        TableName: process.env.SINGLE_TABLE_NAME!,
        Key: { pk: `ORDER#${orderId}`, sk: `ORDER#${orderId}` },
    };

    await dynamoDB.delete(deleteParams).promise();

    const emailParams = {
        Destination: {
            ToAddresses: [/* Customer's Email Address */],
        },
        Message: {
            Body: {
                Text: { Data: "Your order has been cancelled." },
            },
            Subject: { Data: "Order Cancellation Notification" },
        },
        Source: /* Your Email Address */,
    };

    await ses.sendEmail(emailParams).promise();

    const failParams = {
        error: 'OrderRejected',
        cause: 'The order was not approved.',
        taskToken,
    };

    await stepfunctions.sendTaskFailure(failParams).promise();
};
