import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class AwsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'OnlineShopSingleTableAWS', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
    });

    // Define the GS1 index
    table.addGlobalSecondaryIndex({
      indexName: 'gs1',
      partitionKey: { name: 'gs1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gs1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['gs1pk', 'gs1sk', 'data'],
    });

    // Create the AppSync API
    const api = new appsync.GraphqlApi(this, 'OnlineShopAWS', {
      name: 'OnlineShopAWS',
      schema: appsync.SchemaFile.fromAsset('graphql/schema.graphql')
    });

    // Create resolvers for the mutations
    const mutationHandler = new lambda.Function(this, 'MutationHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'mutations.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      },
    });

    // Create resolvers for the queries
    const queryHandler = new lambda.Function(this, 'QueryHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'queries.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      },
    });

    // Add a data sources for the Lambda functions
    const lambdaDs = api.addLambdaDataSource('LambdaDataSource', mutationHandler);
    const lambdaQueryDs = api.addLambdaDataSource('QueriesDataSource', queryHandler);

    // Create resolvers
    lambdaDs.createResolver("CreateProductResolver",{
      typeName: 'Mutation',
      fieldName: 'createProduct',
    });

    lambdaDs.createResolver("UpdateProductResolver",{
      typeName: 'Mutation',
      fieldName: 'updateProduct',
    });

    lambdaDs.createResolver("DeleteProductResolver",{
      typeName: 'Mutation',
      fieldName: 'deleteProduct',
    });

    lambdaDs.createResolver("CreateCategoryResolver", {
      typeName: 'Mutation',
      fieldName: 'createCategory',
    });

    lambdaDs.createResolver("CreateSupplierResolver", {
      typeName: 'Mutation',
      fieldName: 'createSupplier',
    });

    lambdaQueryDs.createResolver("getCategoriesResolver", {
      typeName: 'Query',
      fieldName: 'getCategories',
    });

    lambdaQueryDs.createResolver("getProductsResolver", {
      typeName: 'Query',
      fieldName: 'getProducts',
    });

    lambdaQueryDs.createResolver("getProductResolver", {
      typeName: 'Query',
      fieldName: 'getProduct',
    });

    // Connect the resolvers to the Lambda function
    api.grantMutation(mutationHandler);

    table.grantReadWriteData(mutationHandler);

    cdk.Tags.of(table).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(mutationHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(queryHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
  }
}
