import { APIGatewayProxyHandler } from 'aws-lambda';
import { SNS, DynamoDB } from 'aws-sdk';

export const handler: APIGatewayProxyHandler = async (event: any) => {
    console.log("New event:", event);
    const sns = new SNS();
    const { queryStringParameters } = event;
    const { orderId, taskToken, result } = queryStringParameters || {};

    if (!orderId || !taskToken || !result) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required parameters' }),
        };
    }

    const dynamoDb = new DynamoDB.DocumentClient();

    const convertedTaskToken = taskToken.replace(/ /g, '+');

    const action = result === 'approve' ? 'approved' : 'rejected';

    const params = {
        taskToken: convertedTaskToken,
        output: JSON.stringify({ result: action, orderId }),
    };

    try {
        const getOrderParams = {
            TableName: process.env.SINGLE_TABLE_NAME,
            Key: { pk: "ORDER#", sk: `ORDER#${orderId}` },
        };
        const orderData = await dynamoDb.get(getOrderParams).promise();
        if (!orderData.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Order not found' }),
            };
        }

        // Now orderData.Item contains the order information
        console.log('Order data:', orderData.Item);

        const params = {
            Message: JSON.stringify({ orderId, customerEmail: orderData.Item.CustomerEmail, taskToken: convertedTaskToken, result: action}),
            TopicArn: process.env.SNS_TOPIC_ARN,
        };

        await sns.publish(params).promise();
        // await stepFunctions.sendTaskSuccess(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Order ${action} successfully.` }),
        };
    } catch (error) {
        console.error('Error sending task success:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error:' + JSON.stringify(error) }),
        };
    }
};
