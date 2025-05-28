#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ECSImageHandlerStack } from '../lib/constructs-stack';

const app = new cdk.App();

new ECSImageHandlerStack(app, 'serverless-ecs-image-handler-stack', {
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION
  },
  description: 'Serverless ECS Image Handler Stack (qs-1s4aulbh9)'
});

app.synth();
