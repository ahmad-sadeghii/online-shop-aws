import { DynamoDB } from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient();

interface Event {
    info: { fieldName: string };
    arguments: {
        Id?: string;
        CategoryId?: string;
    };
}

interface Product {
    Id: string;
    Name: string;
    Description: string;
    Price: number;
    Weight: number;
    SupplierId: string;
    ImageUrl: string;
}

interface Category {
    Id: string;
    Name: string;
    Description: string;
}

exports.handler = async (event: Event) => {
    console.log("New Event:", event);
    const { info: { fieldName }, arguments: args } = event;

    switch (fieldName) {
        case 'getProduct':
            return await getProduct(args.Id);
        case 'getProducts':
            return await getProducts(args.CategoryId);
        case 'getCategories':
            return await getCategories();
        default:
            throw new Error('Unsupported operation');
    }
};

const getProduct = async (Id?: string): Promise<Product | null> => {
    if (!Id) throw new Error('Product ID is required');

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
};

const getProducts = async (CategoryId?: string): Promise<Product[]> => {
    if (!CategoryId) throw new Error('Category ID is required');

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
};

const getCategories = async (): Promise<Category[]> => {
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
