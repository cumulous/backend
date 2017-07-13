#!/bin/sh

trap 'exit' ERR

TEMPLATE_FILE="backend.yaml"
PACKAGE_FILE="app.zip"

aws s3 cp . s3://${ARTIFACTS_BUCKET}/templates/${STACK_NAME}/ \
  --recursive \
  --exclude '*' \
  --include 'templates/*.yaml' \
  --exclude 'infrastructure.yaml' \
  --include 'api/swagger/swagger.yaml'

aws cloudformation package \
  --template-file templates/${TEMPLATE_FILE} \
  --output-template-file ${TEMPLATE_FILE} \
  --s3-bucket ${ARTIFACTS_BUCKET} \
  --s3-prefix lambda/${STACK_NAME}
aws s3 cp ${TEMPLATE_FILE} s3://${ARTIFACTS_BUCKET}/templates/${STACK_NAME}/

cd app
zip -qr ../${PACKAGE_FILE} .
cd ..

PACKAGE_VERSION=$(sha256sum ${PACKAGE_FILE} | head -c 64)
PACKAGE_PATH="lambda/${STACK_NAME}/${PACKAGE_VERSION}.zip"

aws s3 cp ${PACKAGE_FILE} s3://${ARTIFACTS_BUCKET}/${PACKAGE_PATH}

CHANGE_SET="--stack-name ${STACK_NAME} --change-set-name Deploy"
ARGS=" \
  ${CHANGE_SET} \
  --template-url https://${ARTIFACTS_BUCKET}.s3.amazonaws.com/templates/${STACK_NAME}/${TEMPLATE_FILE} \
  --role-arn ${DEPLOYMENT_ROLE} \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=ArtifactsBucket,ParameterValue=${ARTIFACTS_BUCKET} \
    ParameterKey=LambdaPackage,ParameterValue=${PACKAGE_PATH} \
    ParameterKey=VpcRange,ParameterValue=${VPC_RANGE} \
    ParameterKey=EncryptionKeyId,ParameterValue=${ENCRYPTION_KEY_ID} \
    ParameterKey=SecretsBucket,ParameterValue=${SECRETS_BUCKET} \
    ParameterKey=SSHKeyName,ParameterValue=${STACK_NAME} \
    ParameterKey=SSHKeyS3Path,ParameterValue=ssh/${STACK_NAME}.pem \
    ParameterKey=SSHKeyGetRole,ParameterValue=${SSH_KEY_GET_ROLE} \
    ParameterKey=SSHKeyPutRole,ParameterValue=${SSH_KEY_PUT_ROLE} \
    ParameterKey=DomainZone,ParameterValue=${DOMAIN_ZONE} \
    ParameterKey=APIDomain,ParameterValue=api.${WEB_DOMAIN} \
    ParameterKey=WebDomain,ParameterValue=${WEB_DOMAIN} \
    ParameterKey=WebBucket,ParameterValue=${WEB_BUCKET} \
    ParameterKey=WebTTL,ParameterValue=${WEB_TTL} \
    ParameterKey=WebPriceClass,ParameterValue=${WEB_PRICE_CLASS} \
    ParameterKey=WebLocations,ParameterValue=${WEB_LOCATIONS} \
    ParameterKey=WebACL,ParameterValue=${WEB_ACL} \
    ParameterKey=WebSigningKeyGetRoleArn,ParameterValue=${WEB_SIGNING_KEY_GET_ROLE_ARN} \
    ParameterKey=WebSigningKeyPutRoleArn,ParameterValue=${WEB_SIGNING_KEY_PUT_ROLE_ARN} \
    ParameterKey=SearchDomain,ParameterValue=${SEARCH_DOMAIN} \
    ParameterKey=DatasetsBucket,ParameterValue=${DATASETS_BUCKET} \
    ParameterKey=ClusterCores,ParameterValue=${CLUSTER_CORES} \
    ParameterKey=SpotBidPercent,ParameterValue=${SPOT_BID_PERCENT} \
    ParameterKey=Auth0Domain,ParameterValue=${AUTH0_DOMAIN} \
    ParameterKey=Auth0ManagementClientID,ParameterValue=${AUTH0_MANAGEMENT_CLIENT_ID} \
    ParameterKey=Auth0ManagementClientSecret,ParameterValue=${AUTH0_MANAGEMENT_CLIENT_SECRET} \
    ParameterKey=Auth0UserTokenLifetime,ParameterValue=${AUTH0_USER_TOKEN_LIFETIME} \
    ParameterKey=Auth0GetManagementSecretRoleArn,ParameterValue=${AUTH0_GET_MANAGEMENT_SECRET_ROLE_ARN} \
    ParameterKey=Auth0PutSecretRoleArn,ParameterValue=${AUTH0_PUT_SECRET_ROLE_ARN} \
    ParameterKey=Auth0CreateClientRoleArn,ParameterValue=${AUTH0_CREATE_CLIENT_ROLE_ARN} "

aws cloudformation delete-change-set ${CHANGE_SET} || true
aws cloudformation create-change-set ${ARGS} || \
  aws cloudformation create-change-set --change-set-type CREATE ${ARGS}
aws cloudformation wait change-set-create-complete ${CHANGE_SET}
