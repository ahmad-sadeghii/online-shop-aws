import { APIGatewayProxyHandler } from 'aws-lambda';
import { StepFunctions } from 'aws-sdk';

const stepFunctions = new StepFunctions();

export const handler: APIGatewayProxyHandler = async (event) => {
    console.log("New event:", event);
    const { queryStringParameters } = event;
    const { orderId, taskToken, result } = queryStringParameters || {};

    if (!orderId || !taskToken || !result) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required parameters' }),
        };
    }

    const action = result === 'approve' ? 'approved' : 'rejected';

    const params = {
        taskToken,
        output: JSON.stringify({ result: action, orderId }),
    };

    try {
        await stepFunctions.sendTaskSuccess(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Order ${action} successfully.` }),
        };
    } catch (error) {
        console.error('Error sending task success:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};
