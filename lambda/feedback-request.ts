import { SES } from 'aws-sdk';

const ses = new SES();

export const handler = async (event: any) => {
    const order = event.detail;  // Assume the order details are passed in the event
    const params = {
        Destination: {
            ToAddresses: [order.email],
        },
        Message: {
            Body: {
                Text: { Data: "Please provide feedback for your order." }
            },
            Subject: { Data: "Feedback Request" }
        },
        Source: "ahmad.sadeghi@trilogy.com",
    };

    await ses.sendEmail(params).promise();
};
