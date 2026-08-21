const { Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType } = require('docx');

function buildProposalDoc({ clientName, clientPhone, clientEmail, estimateRef, jobAddress, date, lineItems, total, optional }) {
  const t = (text, opts = {}) => new TextRun({ text, size: 22, font: 'Times New Roman', ...opts });
  const tb = (text, opts = {}) => t(text, { bold: true, ...opts });
  const u = { underline: { type: UnderlineType.SINGLE } };
  const p = (children, opts = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 0 }, ...opts });

  const children = [
    p([tb(`DATE:   ${date}`)], { alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),
    p([tb('TO:'), t('    '), t(clientName, u)], { spacing: { after: 0 } }),
    ...(clientPhone ? [p([t(clientPhone)], { indent: { left: 864 }, spacing: { after: 0 } })] : []),
    ...(clientEmail ? [p([t(clientEmail)], { indent: { left: 864 }, spacing: { after: 0 } })] : []),
    ...(estimateRef ? [p([t(estimateRef)], { indent: { left: 864 }, spacing: { after: 240 } })] : [p([t('')], { spacing: { after: 240 } })]),
    p([tb('JOB SITE:'), t('  '), t(jobAddress.split(' ')[0], u), t(' ' + jobAddress.split(' ').slice(1).join(' '))], { spacing: { after: 200 } }),
    p([tb('SCOPE OF WORK:')], { spacing: { after: 0 } }),
    p([t('Based on site visit, Cavaliere Electric & Sons is pleased to quote the above-mentioned job. We will provide all labor and materials for a complete job. Work is to be done in accordance with all local and national electrical codes and guaranteed for one year.')], { indent: { left: 720 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 } }),
    p([tb('INCLUDING:')], { spacing: { after: 80 } }),
    ...lineItems.map((item, i) => p([tb(`${i + 1}.  ${item.desc}${item.price ? '   $' + Number(item.price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}`)], { indent: { left: 720 }, spacing: { after: 60 } })),
    p([t('')], { spacing: { after: 120 } }),
    p([tb('TOTAL COST OF JOB:'), t('  '), tb('$' + Number(total).toLocaleString('en-US', { minimumFractionDigits: 2 }), u)], { spacing: { after: 200 } }),
    ...(optional ? [p([tb('Optional:'), t('  '), tb(optional)], { spacing: { after: 200 } })] : []),
    p([tb('EXCLUSIONS:')], { spacing: { after: 80 } }),
    p([t('1.  Permit fees issued by the City to be billed to customer.  (If applicable)')], { indent: { left: 720 }, spacing: { after: 60 } }),
    p([t('2.  Permit runner fees (approximately $275.00 per permit).  (If applicable)')], { indent: { left: 720 }, spacing: { after: 60 } }),
    p([t('3.  Any other work other than outlined above.')], { indent: { left: 720 }, spacing: { after: 60 } }),
    p([t('4.  Patch work & painting.')], { indent: { left: 720 }, spacing: { after: 200 } }),
    p([tb('TERMS OF PAYMENT:'), t('  50% Deposit due on start. 50% due on completion.')], { spacing: { after: 160 } }),
    p([tb('NOTE:'), t('  All Credit Card payments will incur an additional 3.6% credit card fee for the total amount of the proposal.')], { spacing: { after: 160 } }),
    p([tb('NOTE:', u), tb('  If a permit is pulled there will be additional fees for '), tb('permit', u), tb(' ($500) and additional work that may be required by city '), tb('inspector', u), tb(' such as surge protection ($350), smoke detectors ($75 each) and '), tb('CO2', u), tb('.')], { spacing: { after: 0 } }),
  ];

  return new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 1080, right: 1080 } } }, children }] });
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const path = event.path || '';

  // Image extraction endpoint
  if (path.includes('extract')) {
    try {
      const { imageBase64, mimeType } = JSON.parse(event.body);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 500,
          system: 'Extract client contact info from this image. Respond ONLY with valid JSON, no markdown:\n{"clientName":"","clientPhone":"","clientEmail":"","jobAddress":"","estimateRef":""}\nLeave as empty string if not visible.',
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } }, { type: 'text', text: 'Extract the client contact information.' }] }]
        })
      });
      const data = await response.json();
      const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(JSON.parse(raw)) };
    } catch (err) {
      return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
    }
  }

  // DOCX generation endpoint
  try {
    const { clientName, clientPhone, clientEmail, estimateRef, jobAddress, date, lineItems, total, optional } = JSON.parse(event.body);
    if (!clientName || !jobAddress || !lineItems?.length) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing required fields' }) };
    const doc = buildProposalDoc({ clientName, clientPhone, clientEmail, estimateRef, jobAddress, date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), lineItems, total: total || lineItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0), optional });
    const buffer = await Packer.toBuffer(doc);
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="Proposal_${clientName.replace(/\s+/g, '_')}.docx"`, 'Content-Transfer-Encoding': 'base64' }, body: buffer.toString('base64'), isBase64Encoded: true };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
