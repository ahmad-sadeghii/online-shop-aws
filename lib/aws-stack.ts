import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications'
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class AwsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'OnlineShopTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'gs1',
      partitionKey: { name: 'gs1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gs1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Cognito
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'OnlineShopAwsUserPool',
      signInAliases: {
        username: true,
        email: true,
      },
    });

    // Creating user pool client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // Create the AppSync API
    const api = new appsync.GraphqlApi(this, 'OnlineShopAWS', {
      name: 'OnlineShopAWS',
      schema: appsync.SchemaFile.fromAsset('graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
            appIdClientRegex: userPoolClient.userPoolClientId
          },
        },
      },
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

    // For sending a new order for owner
    const shipmentApprovalTopic = new sns.Topic(this, 'OnlineShopShipmentApprovalTopic');

    shipmentApprovalTopic.addSubscription(new snsSubscriptions.EmailSubscription('ahmad.sadeghi@trilogy.com'));

    // Create resolvers for the queries
    const queryHandler = new lambda.Function(this, 'QueryHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'queries.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      }
    });

    // Step functions
    const approvalLambda = new NodejsFunction(this, 'ApprovalLambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/shipment-approval.ts',
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      },
    });

    const approvalApi = new apigateway.RestApi(this, 'ApprovalApi', {
      restApiName: 'Approval Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET'],
      },
    });

    const approvalLambdaIntegration = new apigateway.LambdaIntegration(approvalLambda, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    approvalApi.root.addMethod('GET', approvalLambdaIntegration);

    const sendConfirmationEmailLambda = new NodejsFunction(this, 'SendConfirmationEmailLambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/sendConfirmationEmail.ts',
      environment: {
        APPROVAL_API_URL: approvalApi.url,
        SHIPMENT_APPROVAL_TOPIC_ARN: shipmentApprovalTopic.topicArn,
      }
    });

    // Define the Lambda function to handle approval/rejection
    const approvalHandlerLambda = new NodejsFunction(this, 'ApprovalHandlerLambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/approvalHandler.ts',
    });

    const rejectedHandlerLambda = new NodejsFunction(this, 'RejectedHandlerLambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/rejectedHandler.ts',
    });

    // Define the State Machine
    // const orderApprovalStateMachine = new stepfunctions.StateMachine(this, 'OrderApprovalStateMachine', {
    //   definition: new tasks.LambdaInvoke(this, 'Send Confirmation Email', {
    //     lambdaFunction: sendConfirmationEmailLambda,
    //     integrationPattern: stepfunctions.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    //     payload: stepfunctions.TaskInput.fromObject({
    //       'orderId.$': '$.orderId',
    //       'customerName.$': '$.customerName',
    //       "taskToken": stepfunctions.JsonPath.taskToken,
    //     }),
    //   })
    //       .next(new stepfunctions.Wait(this, 'Wait for Approval', {
    //         time: stepfunctions.WaitTime.duration(cdk.Duration.hours(48)),
    //       }))
    //       .next(new stepfunctions.Choice(this, 'Was Order Approved?')
    //           .when(stepfunctions.Condition.stringEquals('$.Payload.result', 'approved'),
    //               new stepfunctions.Pass(this, 'Order Approved')
    //           )
    //           .otherwise(new tasks.LambdaInvoke(this, 'Handle Rejection', {
    //             lambdaFunction: approvalHandlerLambda,
    //             payload: stepfunctions.TaskInput.fromObject({
    //               'orderId.$': '$.orderId',
    //               'approval': false,
    //             }),
    //           })
    //               .next(new stepfunctions.Fail(this, 'Fail', { cause: 'Order was not approved' })))
    //       ),
    // });

    const orderApprovalStateMachine = new stepfunctions.StateMachine(this, 'OrderApprovalStateMachine', {
      definition: new tasks.LambdaInvoke(this, 'Send Confirmation Email', {
        lambdaFunction: sendConfirmationEmailLambda,
        integrationPattern: stepfunctions.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        payload: stepfunctions.TaskInput.fromObject({
          'orderId.$': '$.orderId',
          'customerName.$': '$.customerName',
          "taskToken": stepfunctions.JsonPath.taskToken,
        }),
      })
          .next(new stepfunctions.Wait(this, 'Wait for Approval', {
            time: stepfunctions.WaitTime.duration(cdk.Duration.hours(48)),
          })
              .next(new tasks.LambdaInvoke(this, 'Handle Rejection After Timeout', {
                lambdaFunction: rejectedHandlerLambda,
                payload: stepfunctions.TaskInput.fromObject({
                  'orderId.$': '$.orderId',
                  'approval': false,
                }),
              })
                  .next(new stepfunctions.Choice(this, 'Was Order Approved?')
                      .when(stepfunctions.Condition.stringEquals('$.Payload.result', 'approved'),
                          new tasks.LambdaInvoke(this, 'Handle Approval', {
                            lambdaFunction: approvalHandlerLambda,
                            payload: stepfunctions.TaskInput.fromObject({
                              'orderId.$': '$.orderId',
                              'approval': true,
                            }),
                          })
                      )
                      .otherwise(new tasks.LambdaInvoke(this, 'Handle Rejection', {
                        lambdaFunction: rejectedHandlerLambda,
                        payload: stepfunctions.TaskInput.fromObject({
                          'orderId.$': '$.orderId',
                          'approval': false,
                        }),
                      }))
                  ))),
    });
    // Create resolvers for the orders
    const orderHandler = new NodejsFunction(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/order.js',
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
        ORDER_APPROVAL_STATE_MACHINE_ARN: orderApprovalStateMachine.stateMachineArn,
      },
      bundling: {
        loader: {'.html': 'text', '.txt': 'text'}
      }
    });

    // Grant the necessary SES permissions to the Lambda function's role
    const sesPolicy = new iam.Policy(this, 'SESPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: ['*'],  // This allows sending emails to/from any email address
          effect: iam.Effect.ALLOW,
        }),
      ],
    });

    // Attach the policy to the Lambda function's role
    orderHandler.role?.attachInlinePolicy(sesPolicy);

    orderHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [orderApprovalStateMachine.stateMachineArn],
    }));

    sendConfirmationEmailLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [shipmentApprovalTopic.topicArn],
    }));

    // Add a data sources for the Lambda functions
    const lambdaDs = api.addLambdaDataSource('LambdaDataSource', mutationHandler);
    const lambdaQueryDs = api.addLambdaDataSource('QueriesDataSource', queryHandler);
    const lambdaOrderDs = api.addLambdaDataSource('OrderDataSource', orderHandler);

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

    lambdaOrderDs.createResolver("PlaceOrderResolver", {
      typeName: 'Mutation',
      fieldName: 'placeOrder',
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
    api.grantMutation(orderHandler);

    // Create a S3 Bucket
    const reportBucket = new s3.Bucket(this, 'ReportBucket', {
      versioned: true,
    });

    const reportGenerator = new NodejsFunction(this, 'ReportGenerator', {
      runtime: lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.minutes(3),
      memorySize: 1024,
      entry: 'lambda/report.js',
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
        BUCKET_NAME: reportBucket.bucketName,
      },
      bundling: {
        loader: {'.html': 'text'},
        externalModules: [
          "aws-sdk",
        ],
        nodeModules: ["@sparticuz/chromium"],
      }
    });

    // Grant the necessary permissions
    reportGenerator.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [`${reportBucket.bucketArn}/*`],
    }));

    reportGenerator.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:Query', 'dynamodb:BatchGetItem', 'dynamodb:putItem'],
      resources: [table.tableArn, `${table.tableArn}/index/*`],
    }));

    // Create a daily rule
    const dailyRule = new events.Rule(this, 'DailyRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '0' }),
    });

    dailyRule.addTarget(new targets.LambdaFunction(reportGenerator));

    table.grantReadWriteData(mutationHandler);
    table.grantReadWriteData(orderHandler);
    table.grantReadData(queryHandler);

    // SNS Topic
    const reportNotificationTopic = new sns.Topic(this, 'ReportNotificationTopic');

    reportNotificationTopic.addSubscription(new snsSubscriptions.EmailSubscription('ahmad.sadeghi@trilogy.com'));

    // Lambda function to be triggered
    const reportNotificationLambda = new NodejsFunction(this, 'ReportNotificationLambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/s3Notification.ts',
      environment: {
        SNS_TOPIC_ARN: reportNotificationTopic.topicArn,
        SINGLE_TABLE_NAME: table.tableName,
      },
      bundling: {
        loader: {'.txt': 'text'},
      },
    });

    reportBucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, new s3n.LambdaDestination(reportNotificationLambda));

    // Grant the Lambda function permissions to read from the S3 bucket
    reportBucket.grantRead(reportNotificationLambda);

    // Grant the Lambda function permission to publish to the SNS topic
    reportNotificationLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [reportNotificationTopic.topicArn],
    }));

    reportNotificationLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [table.tableArn],
    }));

    // Output the User Pool ID to the stack outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    cdk.Tags.of(table).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(mutationHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(queryHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(orderHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(userPool).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(reportBucket).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(reportGenerator).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(reportNotificationTopic).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(reportNotificationLambda).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(orderApprovalStateMachine).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(shipmentApprovalTopic).add("Owner", "ahmad.sadeghi@trilogy.com");
  }
}
