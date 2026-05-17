const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { getDevices } = require('./thingsboard');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;

    const devices = await getDevices();
    const deviceSummary = devices.map(d => `- ${d.name} (ID: ${d.id.id})`).join('\n');

    const systemPrompt = `You are an AI assistant for Get220v IoT Platform.
You have access to the following devices:
${deviceSummary}

Answer questions about IoT devices, telemetry data, and platform status.
Be concise and helpful. Always respond in the same language as the user's question.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 500
    });

    res.json({
      reply: completion.choices[0].message.content,
      devices: devices.length
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
