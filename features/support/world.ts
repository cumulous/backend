import { CallbackStepDefinition as Callback, Hooks, HookScenario as Scenario } from 'cucumber';

export = function() {
  const hooks = <Hooks>this;

  hooks.Before((scenario: Scenario, callback: Callback) => {
		callback(null, 'pending');
  });

  hooks.After((scenario: Scenario, callback: Callback) => {
		callback(null, 'pending');
  });
};