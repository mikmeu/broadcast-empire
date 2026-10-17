// Sends every answer of the form on the website (the "Ask for a feature or report a problem" form on
// the changelog page) to the support address, where the pipeline files it like any other message.
//
// In the form: the three dots, "Apps Script". Paste this in place of what is there, save, choose
// setUp in the list at the top and press Run, and allow it to send mail as you. Once is enough.

const SUPPORT = 'support@broadcastempire.online';
// The pipeline knows a form answer by this subject (FORM_SUBJECT in pipeline/dispatch.py).
const SUBJECT = 'From the form on the website';

function setUp() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('onAnswer').forForm(form).onFormSubmit().create();
}

function onAnswer(e) {
  const answers = e.response.getItemResponses()
    .map((answer) => `${answer.getItem().getTitle()}\n${[].concat(answer.getResponse()).join(', ')}`);
  let replyTo = '';
  try {
    replyTo = e.response.getRespondentEmail();
  } catch (error) {
    // The form does not collect e-mail addresses.
  }
  const mail = { to: SUPPORT, subject: SUBJECT, body: answers.join('\n\n') };
  if (replyTo) mail.replyTo = replyTo;
  MailApp.sendEmail(mail);
}
