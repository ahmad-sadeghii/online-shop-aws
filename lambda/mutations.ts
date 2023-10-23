import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';

const dynamoDB = new DynamoDB.DocumentClient();

interface Event {
    info: { fieldName: string };
    arguments: any;
    identity: { groups: string[] } | null;
}

interface ProductInput {
    Name: string;
    Description: string;
    CategoryId: string;
    SupplierId: string;
    Price: number;
    Weight: number;
}

interface CategoryInput {
    Name: string;
    Description: string;
}

interface SupplierInput {
    Name: string;
}

export const handler = async (event: Event) => {
    console.log("New Event:", event);
    const { info: { fieldName }, arguments: args, identity } = event;

    const userGroups = identity && identity.groups || [];

    const isAdmin = userGroups.includes('Admins');

    if (!isAdmin) {
        throw new Error('Forbidden: You do not have permission to perform this operation');
    }

    switch (fieldName) {
        case 'createProduct':
            return createProduct(args.input);
        case 'updateProduct':
            return updateProduct(args.input);
        case 'deleteProduct':
            return deleteProduct(args.input);
        case 'createCategory':
            return createCategory(args.input);
        case 'createSupplier':
            return createSupplier(args.input);
        default:
            throw new Error('Unsupported operation');
    }
};

const createProduct = async (input: ProductInput) => {
    const id = crypto.createHash('sha256').update(input.Name + Date.now()).digest('hex');
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME!,
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

const createCategory = async (input: CategoryInput) => {
    const id = crypto.createHash('sha256').update(input.Name + Date.now()).digest('hex');
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME!,
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

const createSupplier = async (input: SupplierInput) => {
    const id = crypto.createHash('sha256').update(input.Name + Date.now()).digest('hex');
    const params = {
        TableName: process.env.SINGLE_TABLE_NAME!,
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

const updateProduct = async (input: ProductInput & { Id: string }) => {
    const { Id, ...updatedInfo } = input;
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: { [key: string]: any } = {};
    const updateExpressionParts: string[] = [];

    for (const [key, value] of Object.entries(updatedInfo)) {
        const attrNamePlaceholder = `#${key}`;
        const attrValuePlaceholder = `:${key}`;

        expressionAttributeNames[attrNamePlaceholder] = key;
        expressionAttributeValues[attrValuePlaceholder] = value;
        updateExpressionParts.push(`${attrNamePlaceholder} = ${attrValuePlaceholder}`);
    }

    const params = {
        TableName: process.env.SINGLE_TABLE_NAME!,
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

const deleteProduct = async (input: { Id: string }) => {
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