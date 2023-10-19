const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    console.log("New Event:", event);
    const { info: { fieldName }, arguments } = event;

    switch (fieldName) {
        case 'getProduct':
            return await getProduct(arguments.Id);
        case 'getProducts':
            return await getProducts(arguments.CategoryId);
        case 'getCategories':
            return await getCategories();
        default:
            throw new Error('Unsupported operation');
    }
};

async function getProduct(Id) {
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Key: {
            pk: 'PRODUCT#',
            sk: `PRODUCT#${Id}`,
        },
    };

    try {
        const result = await dynamoDB.get(params).promise();
        if (result.Item) {
            return {
                Id: result.Item.Id,
                Name: result.Item.Name,
                Description: result.Item.Description,
                Price: result.Item.Price,
                Weight: result.Item.Weight,
                SupplierId: result.Item.SupplierId,
                ImageUrl: result.Item.ImageUrl,
            };
        } else {
            throw new Error('Product not found');
        }
    } catch (error) {
        console.error('Error getting product:', error.message);
        throw error;
    }
}

const getProducts = async (CategoryId) => {
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        FilterExpression: 'gs1pk = :gs1pk',
        ExpressionAttributeValues: {
            ':gs1pk': `CATEGORY#${CategoryId}`,
            ':sk': 'PRODUCT#',
            ':pk': 'PRODUCT#',
        },
    };

    const result = await dynamoDB.query(params).promise();

    return result.Items.map(item => ({
        Id: item.Id,
        Name: item.Name,
        Description: item.Description,
        Price: item.Price,
        Weight: item.Weight,
        SupplierId: item.SupplierId,
        ImageUrl: item.ImageUrl,
    }));
}

const getCategories = async () => {
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
            ':pk': 'CATEGORY#',
        },
    };

    const result = await dynamoDB.query(params).promise();

    return result.Items.map(item => ({
        Id: item.Id,
        Name: item.Name,
        Description: item.Description,
    }));
};