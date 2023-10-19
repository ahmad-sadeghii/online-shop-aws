const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');

const LocalDateTime = new GraphQLScalarType({
    name: 'LocalDateTime',
    description: 'Local date and time in ISO 8601 format',
    serialize(value) {
        // Convert Date object to ISO 8601 string
        return value.toISOString();
    },
    parseValue(value) {
        // Convert ISO 8601 string to Date object
        return new Date(value);
    },
    parseLiteral(ast) {
        if (ast.kind === Kind.STRING) {
            // Convert ISO 8601 string to Date object
            return new Date(ast.value);
        }
        return null;
    },
});

exports.handler = async (event) => {
    const customerEmail = event.identity.username;
    const { shippingAddress, orderDetails } = event.arguments;
    const orderDate = new Date().toISOString();

    const order = {
        id: `ORDER#${Date.now()}`, // Generate a unique order ID
        customerEmail,
        shippingAddress,
        orderDetails,
        orderDate,
    };

    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Item: order,
    };

    await dynamoDB.put(params).promise();

    return order;
};
