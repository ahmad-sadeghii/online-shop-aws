const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const crypto = require('crypto');

exports.handler = async (event) => {
    console.log("New Event:", event);
    const { info: { fieldName }, arguments } = event;

    switch (fieldName) {
        case 'createProduct':
            return createProduct(arguments.input);
        case 'updateProduct':
            return updateProduct(arguments.input);
        case 'deleteProduct':
            return deleteProduct(arguments.input);
        case 'createCategory':
            return createCategory(arguments.input);
        case 'createSupplier':
            return createSupplier(arguments.input);
        default:
            throw new Error('Unsupported operation');
    }
};

const createProduct = async (input) => {
    const id = crypto.createHash('sha256').update(input.Name + Date.now()).digest('hex');
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Item: {
            pk: 'PRODUCT#',
            sk: `PRODUCT#${id}`,
            Id: id,
            Name: input.Name,
            Description: input.Description,
            CategoryId: input.CategoryId,
            SupplierId: input.SupplierId,
            Price: input.Price,
            Weight: input.Weight,
            gs1pk: `CATEGORY#${input.CategoryId}`,
            gs1sk: `PRODUCT#${input.Name}#${id}`,
        },
    };

    try {
        await dynamoDB.put(params).promise();
        return params.Item;
    } catch (error) {
        throw new Error('Error creating product: ' + error.message);
    }
}

const createCategory = async (input) => {
    const id = crypto.createHash('sha256').update(input.Name + Date.now()).digest('hex');
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Item: {
            pk: `CATEGORY#`,
            sk: `CATEGORY#${id}`,
            Id: id,
            Name: input.Name,
            Description: input.Description,
            gs1pk: 'CATEGORY#',
            gs1sk: `CATEGORY#${input.Name}#${id}`,
        },
    };

    try {
        await dynamoDB.put(params).promise();
        return params.Item;
    } catch (error) {
        throw new Error('Error creating category: ' + error.message);
    }
}

const createSupplier = async (input) => {
    const id = crypto.createHash('sha256').update(input.Name + Date.now()).digest('hex');
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Item: {
            pk: `SUPPLIER#`,
            sk: `SUPPLIER#${id}`,
            Id: id,
            Name: input.Name,
            gs1pk: 'SUPPLIER#',
            gs1sk: `SUPPLIER#${input.Name}#${id}`,
        },
    };

    try {
        await dynamoDB.put(params).promise();
        return params.Item;
    } catch (error) {
        throw new Error('Error creating supplier: ' + error.message);
    }
}

const updateProduct = async (input) => {
    const { Id, ...updatedInfo } = input;
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    const updateExpressionParts = [];

    for (const [key, value] of Object.entries(updatedInfo)) {
        const attrNamePlaceholder = `#${key}`;
        const attrValuePlaceholder = `:${key}`;

        expressionAttributeNames[attrNamePlaceholder] = key;
        expressionAttributeValues[attrValuePlaceholder] = value;
        updateExpressionParts.push(`${attrNamePlaceholder} = ${attrValuePlaceholder}`);
    }

    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Key: {
            pk: 'PRODUCT#',
            sk: `PRODUCT#${Id}`,
        },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    };

    try {
        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    } catch (error) {
        console.error('Error updating product:', error.message);
        throw error;
    }
};

const deleteProduct = async (input) => {
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME,
        Key: {
            pk: 'PRODUCT#',
            sk: `PRODUCT#${input.Id}`,
        },
        ReturnValues: 'ALL_OLD',
    };

    try {
        const result = await dynamoDB.delete(params).promise();
        if (result.Attributes) {
            return true;
        } else {
            throw new Error('Product not found');
        }
    } catch (error) {
        console.error('Error removing product:', error.message);
        throw error;
    }
};