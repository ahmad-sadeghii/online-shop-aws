import { StepFunctions } from 'aws-sdk';

exports.handler = async (event: any): Promise<void> => {
    console.log("New Event:", event);
    const stepFunctions = new StepFunctions();
    const message = JSON.parse(event.Records[0].Sns.Message);
    const { taskToken, result, orderId, customerEmail } = message;
    console.log("Message:", event.Records[0].Sns);

    const params = {
        output: JSON.stringify({ orderId, result, customerEmail }),
        taskToken,
    };

    await stepFunctions.sendTaskSuccess(params).promise();
};
