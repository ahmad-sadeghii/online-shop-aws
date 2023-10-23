import * as aws from 'aws-sdk';
import { Callback, Context } from 'aws-lambda';
import Handlebars from "handlebars";
import emailTemplate from './templates/feedback-request-email.html';

const stepfunctions = new aws.StepFunctions();
const ses = new aws.SES();

export const handler = async (event: any, context: Context, callback: Callback) => {
    console.log("Received Event:", event);
    const { customerEmail } = event;

    // Send shipment confirmation email and advance the workflow
    const compiledTemplate = Handlebars.compile(emailTemplate);

    const data = {
        customerName: customerEmail,
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
                Data: "We love to hear your feedback",
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
};
