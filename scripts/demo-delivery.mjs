// One cycle: recover durable acknowledgements before claiming anything new.
export async function deliveryCycle({ readFile, writeFile, unlink, journal, convex, composio, sender, log = () => {} }) {
    // Recover acknowledgements before claiming another job. Never replay a provider send.
    const saved = await readFile(journal, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (saved) {
      const prior = JSON.parse(saved);
      await convex('demoConsole:finish', prior.result ?? { runId: prior.runId, stage: prior.stage, attempt: prior.attempt, error: 'Runner interrupted; delivery unknown. Inspect Gmail. No resend attempted.' });
      await unlink(journal);
    }
    const job = await convex('demoConsole:claim', { sender });
    if (job) {
      await writeFile(journal, JSON.stringify(job), { mode: 0o600 });
      let result;
      try {
        const sent = await composio('GMAIL_SEND_EMAIL', { user_id: 'me', from_email: sender, recipient_email: job.recipient, cc: job.cc, subject: job.subject, body: job.body, is_html: false, include_signature: false });
        if (!sent?.successful || !sent.data?.id) throw new Error('Provider did not confirm a message id.');
        result = { runId: job.runId, stage: job.stage, attempt: job.attempt, messageId: sent.data.id };
      } catch { result = { runId: job.runId, stage: job.stage, attempt: job.attempt, error: 'Delivery not confirmed. Inspect Gmail before retrying; no automatic resend.' }; }
      await writeFile(journal, JSON.stringify({ ...job, result }), { mode: 0o600 });
      await convex('demoConsole:finish', result);
      await unlink(journal);
      log(`${job.stage}: ${result.messageId ? 'sent' : 'uncertain'}`);
    }
}
