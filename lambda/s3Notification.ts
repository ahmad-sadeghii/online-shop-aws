import { S3, SNS, DynamoDB } from 'aws-sdk';
import { S3Event } from 'aws-lambda';
import reportNotificationTemplate from './templates/daily-order-report-notification.txt';
import * as Handlebars from 'handlebars';

const sns = new SNS();
const s3 = new S3();
const dynamoDB = new DynamoDB.DocumentClient();

export const handler = async (event: S3Event): Promise<void> => {
    console.log("New event:", event);
    const bucket = event.Records[0].s3.bucket.name;
    const key = event.Records[0].s3.object.key;

    const params = {
        Bucket: bucket,
        Key: key,
        Expires: 60, // Expiration time of the URL in seconds
    };

    try {
        const url = await s3.getSignedUrlPromise('getObject', params);

        // Define the parameters for the DynamoDB get operation
        const dbParams = {
            TableName: process.env.SINGLE_TABLE_NAME,
            Key: {
                pk: "REPORTDATA#",
                sk: "REPORTDATA#"
            }
        };

        // Execute the get operation to retrieve the item from DynamoDB
        const data = await dynamoDB.get(dbParams).promise();

        // Check if the item was retrieved successfully
        if (!data.Item) {
            throw new Error('Failed to retrieve report data from DynamoDB');
        }

        // Extract the TotalOrders and GrandTotal values
        const totalOrders = data.Item.TotalOrders;
        const grandTotal = data.Item.GrandTotal;

        // Load the template file
        const template = Handlebars.compile(reportNotificationTemplate);
        // Define the data to be used in the template
        const templateData = {
            currentDate: new Date().toLocaleDateString(),
            totalOrders: totalOrders,
            grandTotal: grandTotal,
            presignedURL: url
        };
        // Render the template with the data
        const message = template(templateData);

        const snsParams = {
            Message: message,
            TopicArn: process.env.SNS_TOPIC_ARN,
        };

        await sns.publish(snsParams).promise();
        console.log('Notification sent successfully');
    } catch (error) {
        console.error('Error generating presigned URL or sending notification:', error);
        throw new Error(error);
    }
};
