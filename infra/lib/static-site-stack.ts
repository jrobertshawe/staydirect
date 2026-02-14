import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import * as path from 'path';

const DOMAIN_NAME = 'staydirect.co.nz';

export class StaticSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Look up existing Route53 hosted zone
    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: DOMAIN_NAME,
    });

    // ACM certificate (stack is in us-east-1, as required by CloudFront)
    const certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: DOMAIN_NAME,
      subjectAlternativeNames: [`www.${DOMAIN_NAME}`],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: new origins.S3StaticWebsiteOrigin(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      domainNames: [DOMAIN_NAME, `www.${DOMAIN_NAME}`],
      certificate,
    });

    // Route53 alias records — apex domain
    new route53.ARecord(this, 'SiteARecord', {
      zone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new route53.AaaaRecord(this, 'SiteAAAARecord', {
      zone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // Route53 alias records — www subdomain
    new route53.ARecord(this, 'WwwARecord', {
      zone,
      recordName: 'www',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new route53.AaaaRecord(this, 'WwwAAAARecord', {
      zone,
      recordName: 'www',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '..', '..'), {
          exclude: ['infra', 'infra/**', 'node_modules', '*.zip', '.git', '.git/**', '.claude', '.claude/**'],
        }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: `https://${DOMAIN_NAME}`,
      description: 'StayDirect website URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
    });
  }
}
