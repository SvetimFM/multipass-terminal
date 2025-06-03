import { PreSignUpTriggerHandler } from 'aws-lambda';

export const handler: PreSignUpTriggerHandler = async (event) => {
  console.log('Pre-signup trigger', event);

  const { userAttributes } = event.request;
  const email = userAttributes.email;
  const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || ['*'];

  // Check if email domain is allowed
  if (allowedDomains[0] !== '*') {
    const emailDomain = email.split('@')[1];
    if (!allowedDomains.includes(emailDomain)) {
      throw new Error(`Email domain ${emailDomain} is not allowed`);
    }
  }

  // Auto-confirm known domains
  if (email.endsWith('@company.com')) {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  return event;
};