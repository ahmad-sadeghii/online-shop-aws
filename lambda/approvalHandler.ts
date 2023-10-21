import * as aws from 'aws-sdk';
import { Callback, Context } from 'aws-lambda';

const stepfunctions = new aws.StepFunctions();
const ses = new aws.SES();

export const handler = async (event: any, context: Context, callback: Callback) => {
    const { orderId, taskToken } = event;

    // Send shipment confirmation email and advance the workflow
    const emailParams = {
        Destination: {
            ToAddresses: [/* Customer's Email Address */],
        },
        Message: {
            Body: {
                Text: { Data: "Your order has been approved and is being shipped." },
            },
            Subject: { Data: "Order Shipment Confirmation" },
        },
        Source: /* Your Email Address */,
    };

    await ses.sendEmail(emailParams).promise();

    const successParams = {
        output: JSON.stringify({ result: 'approved' }),
        taskToken,
    };

    await stepfunctions.sendTaskSuccess(successParams).promise();
};
