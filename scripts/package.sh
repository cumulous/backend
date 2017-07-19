#!/bin/bash

set -e

BACKEND_TEMPLATE="backend.yaml"
PACKAGE_FILE="app.zip"
SWAGGER_FILE="api/swagger/swagger.yaml"
TEMPLATES_DEST_PATH="templates/${STACK_NAME}"
TEMPLATES_DEST="s3://${ARTIFACTS_BUCKET}/${TEMPLATES_DEST_PATH}/"

validate_template() {
  aws cloudformation validate-template --template-body file://$1 > /dev/null
}

validate_template templates/${BACKEND_TEMPLATE}
find templates/nested/ -name "*.yaml" | while read file; do
  validate_template $file
done

get_version() {
  local dir="$1"

  find "$dir" -type f \( -name "*.js" -o -name "*.json" \) ! -name "package.json" \
    -exec md5sum {} \; |
    sort -k 2 |
    md5sum |
    cut -d ' ' -f1
}

API_VERSION=$(md5sum ${SWAGGER_FILE} | cut -d ' ' -f1)
PACKAGE_VERSION=$(get_version app)
PACKAGE_PATH="lambda/${STACK_NAME}/${PACKAGE_VERSION}.zip"

cd app
zip -qr ../${PACKAGE_FILE} .
cd ..

API_LAMBDA_PREFIX="arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${STACK_NAME}"
API_LAMBDA_PREFIX="arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/${API_LAMBDA_PREFIX}"
sed -i "s|\${API_LAMBDA_PREFIX}|${API_LAMBDA_PREFIX}|" ${SWAGGER_FILE}
sed -i "s|\${AUTHORIZER_INVOCATION_ROLE_ARN}|${AUTHORIZER_INVOCATION_ROLE_ARN}|" ${SWAGGER_FILE}

aws s3 cp ${PACKAGE_FILE} s3://${ARTIFACTS_BUCKET}/${PACKAGE_PATH}
aws s3 cp ${SWAGGER_FILE} ${TEMPLATES_DEST}
aws s3 cp templates/${BACKEND_TEMPLATE} ${TEMPLATES_DEST}
aws s3 sync templates/nested/ ${TEMPLATES_DEST}

CHANGE_SET="--stack-name ${STACK_NAME} --change-set-name Deploy"
ARGS=" \
  ${CHANGE_SET} \
  --template-url https://${ARTIFACTS_BUCKET}.s3.amazonaws.com/${TEMPLATES_DEST_PATH}/${BACKEND_TEMPLATE} \
  --role-arn ${DEPLOYMENT_ROLE_ARN} \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=ArtifactsBucket,ParameterValue=${ARTIFACTS_BUCKET} \
    ParameterKey=TemplatesPath,ParameterValue=${TEMPLATES_DEST_PATH} \
    ParameterKey=LambdaPackage,ParameterValue=${PACKAGE_PATH} \
    ParameterKey=VpcRange,ParameterValue=${VPC_RANGE} \
    ParameterKey=EncryptionKeyId,ParameterValue=${ENCRYPTION_KEY_ID} \
    ParameterKey=SecretsBucket,ParameterValue=${SECRETS_BUCKET} \
    ParameterKey=SSHKeyGetRoleArn,ParameterValue=${SSH_KEY_GET_ROLE_ARN} \
    ParameterKey=SSHKeyPutRoleArn,ParameterValue=${SSH_KEY_PUT_ROLE_ARN} \
    ParameterKey=DomainZone,ParameterValue=${DOMAIN_ZONE} \
    ParameterKey=ApiDomain,ParameterValue=api.${WEB_DOMAIN} \
    ParameterKey=ApiVersion,ParameterValue=${API_VERSION} \
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
