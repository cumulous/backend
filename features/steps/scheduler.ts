import { StepDefinitions as Steps, CallbackStepDefinition as Callback } from 'cucumber';

export = function() {
	const steps = <Steps>this;

  steps.Given(/^I am provided with a job API$/, (callback: Callback) => {
		callback(null, 'pending');
	});
	steps.When(/^I submit a job using this API$/, (callback: Callback) => {
		callback(null, 'pending');
	});
	steps.Then(/^I should get a response with a job ID$/, (callback: Callback) => {
		callback(null, 'pending');
	});
};