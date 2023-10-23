import * as aws from 'aws-sdk';
import Handlebars from "handlebars";
import shipmentApprovalNotification from './templates/shipment-approval-request.txt';
const sns = new aws.SNS();

export const handler = async (event: any) => {
    console.log("New event:", event);
    const { orderId, customerName, taskToken } = event;
    const template = Handlebars.compile(shipmentApprovalNotification);

    const templateData = {
        orderId,
        customerName,
        approvalLambdaUrl: process.env.APPROVAL_API_URL,  // replace with the actual approval Lambda URL
        taskToken,
    };

    // Render the template with the data
    const message = template(templateData);

    // Send shipment approval request
    const snsParams = {
        Message: message,
        TopicArn: process.env.SHIPMENT_APPROVAL_TOPIC_ARN,
    };
    await sns.publish(snsParams).promise();

    // const params = {
    //     Message: JSON.stringify({ taskToken, outcome: 'SUCCESS', message: "Email sent successfully" }),
    //     TopicArn: process.env.TASK_TOPIC_ARN,
    // };
    //
    // await sns.publish(params).promise();

    // await stepFunctions.sendTaskSuccess({
    //     output: JSON.stringify({ message: "Email sent successfully" }),
    //     taskToken
    // }).promise();

};
