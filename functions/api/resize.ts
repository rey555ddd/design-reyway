// Gemini API proxy for Resize tool
// POST /api/resize
// Receives image(s) and mode, calls Gemini for layout analysis

interface Env {
  GEMINI_API_KEY: string;
}

interface SizeSpec {
  name: string;
  width: number;
  height: number;
}

interface CropRequest {
  mode: 'crop';
  image: string; // base64
  mimeType: string;
  sizes: SizeSpec[];
}

interface ComposeRequest {
  mode: 'compose';
  background: string; // base64
  backgroundMime?: string;
  product: string; // base64
  productMime?: string;
  decoration?: string | null; // base64
  decorationMime?: string;
  headline: string;
  subtitle?: string;
  cta?: string;
  sizes: SizeSpec[];
}

type ResizeRequest = CropRequest | ComposeRequest;

function buildCropPrompt(sizes: SizeSpec[]): string {
  const sizeList = sizes.map(s => `- "${s.name}": ${s.width}Ã${s.height}`).join('\n');

  return `ä½ æ¯ä¸åå°æ¥­çå¹³é¢è¨­è¨æç AIãåæéå¼µè¨­è¨ç¨¿åçï¼æ¾åºç«é¢ä¸­çééµå§å®¹ååï¼ç¢åãæå­ãLogoãä¸»è¦è¦è¦ºåç´ ï¼ã

ç¶å¾æ ¹æä»¥ä¸ç®æ¨çä½å°ºå¯¸ï¼çºæ¯åçä½çææä½³çæºè½è£åæä»¤ãè£åæå¿é ï¼
1. ä¿çæéè¦çè¦è¦ºåç´ ï¼ç¢åãæå­ï¼
2. æ ¹æçä½æ¯ä¾é¸ææä½³è£ååå
3. é¿åè£åå°ééµå§å®¹

ç®æ¨çä½ï¼
${sizeList}

è«å´æ ¼ä»¥ JSON æ ¼å¼åå³ï¼ä¸è¦æä»»ä½å¶ä»æå­ãæ ¼å¼å¦ä¸ï¼
{
  "layouts": [
    {
      "name": "çä½åç¨±",
      "width": æ¸å­,
      "height": æ¸å­,
      "cropX": 0å°1ä¹éçæ¸å­ï¼è£åèµ·é»Xï¼ä½ååå¯¬åº¦æ¯ä¾ï¼,
      "cropY": 0å°1ä¹éçæ¸å­ï¼è£åèµ·é»Yï¼ä½ååé«åº¦æ¯ä¾ï¼,
      "cropW": 0å°1ä¹éçæ¸å­ï¼è£åå¯¬åº¦ï¼ä½ååå¯¬åº¦æ¯ä¾ï¼,
      "cropH": 0å°1ä¹éçæ¸å­ï¼è£åé«åº¦ï¼ä½ååé«åº¦æ¯ä¾ï¼,
      "focusX": 0å°1ä¹éçæ¸å­ï¼ç¦é»Xä½ç½®ï¼,
      "focusY": 0å°1ä¹éçæ¸å­ï¼ç¦é»Yä½ç½®ï¼
    }
  ]
}

éè¦è¦åï¼
- cropW/cropH çæ¯ä¾å¿é å¹éç®æ¨çä½çå¯¬é«æ¯
- è£åååå¿é å¨ 0~1 ç¯åå§ï¼cropX + cropW <= 1, cropY + cropH <= 1ï¼
- ç¦é»ä½ç½®æè©²æ¯è£åååå§æéè¦çåç´ ä½ç½®
- å°æ¼æ¥µç«¯æ¯ä¾ççä½ï¼å¦ 728Ã90 çæ©«å¹ï¼ï¼é¸æåå«æå¤ééµè³è¨çæ©«åæ¢å¸¶`;
}

function buildComposePrompt(headline: string, subtitle: string, cta: string, sizes: SizeSpec[]): string {
  const sizeList = sizes.map(s => `- "${s.name}": ${s.width}Ã${s.height}`).join('\n');
  const textInfo = [
    `ä¸»æ¨é¡: "${headline}"`,
    subtitle ? `å¯æ¨é¡: "${subtitle}"` : null,
    cta ? `CTAæé: "${cta}"` : null,
  ].filter(Boolean).join('\n');

  return `ä½ æ¯ä¸åå°æ¥­çå¹³é¢è¨­è¨æç AIãææçµ¦ä½ èæ¯ååç¢ååï¼å»èPNGï¼ï¼è«çºä»¥ä¸çä½çææçæä»¤ã

ç´ æè³è¨ï¼
- èæ¯åï¼ç¬¬ä¸å¼µåç
- ç¢ååï¼ç¬¬äºå¼µåçï¼å»èPNGï¼
${textInfo}

ç®æ¨çä½ï¼
${sizeList}

æçååï¼
1. ç¢ååè¦æ¸æ°å¯è¦ï¼ä¸è½å¤ªå°ä¹ä¸è½è¶åºçä½
2. æå­ä¸è½èç¢åéçï¼è¦æè¶³å¤ å°æ¯åº¦
3. æ©«å¼çä½ï¼ç¢ååå³ï¼æå­åå·¦ï¼æåä¹ï¼
4. ç´å¼çä½ï¼ç¢åå¨ä¸­ä¸ï¼æå­å¨ä¸æ¹
5. æ¹å½¢çä½ï¼ç¢åå±ä¸­åä¸ï¼æå­å¨ä¸æ¹
6. æ¥µç«¯æ©«å¹ï¼å¦ 728Ã90ï¼ï¼ç¢ååå·¦å°åï¼æå­åå³
7. CTA æéå¦ææçè©±ï¼æ¾å¨æå­ååä¸æ¹

è«å´æ ¼ä»¥ JSON æ ¼å¼åå³ï¼ä¸è¦æä»»ä½å¶ä»æå­ãæ ¼å¼å¦ä¸ï¼
{
  "layouts": [
    {
      "name": "çä½åç¨±",
      "width": æ¸å­,
      "height": æ¸å­,
      "background": {
        "cropX": 0~1, "cropY": 0~1, "cropW": 0~1, "cropH": 0~1
      },
      "product": {
        "x": 0~1ï¼ç¢åä¸­å¿Xä½ç½®ï¼ä½çä½å¯¬åº¦æ¯ä¾ï¼,
        "y": 0~1ï¼ç¢åä¸­å¿Yä½ç½®ï¼ä½çä½é«åº¦æ¯ä¾ï¼,
        "scale": 0~1ï¼ç¢åç¸®æ¾æ¯ä¾ï¼1=èçä½ç­é«ï¼
      },
      "headline": {
        "x": 0~1, "y": 0~1,
        "fontSize": æ¸å­ï¼åç´ ï¼,
        "color": "#FFFFFF",
        "align": "left"|"center"|"right",
        "maxWidth": 0~1ï¼æå¤§å¯¬åº¦ä½çä½æ¯ä¾ï¼
      },
      "subtitle": {
        "x": 0~1, "y": 0~1,
        "fontSize": æ¸å­,
        "color": "#FFFFFF",
        "align": "left"|"center"|"right",
        "maxWidth": 0~1
      },
      "cta": {
        "x": 0~1, "y": 0~1,
        "fontSize": æ¸å­,
        "color": "#61D0DF",
        "align": "left"|"center"|"right",
        "bgColor": "#FFFFFF",
        "padding": æ¸å­,
        "borderRadius": æ¸å­
      }
    }
  ]
}

æ³¨æï¼
- åº§æ¨é½æ¯ 0~1 çæ¯ä¾å¼
- fontSize æ¯çµå°åç´ å¼ï¼è¦æ ¹æçä½å°ºå¯¸åçèª¿æ´ï¼å¤§çä½ç¨å¤§å­ï¼å°çä½ç¨å°å­ï¼
- å¦ææ²æ subtitle æ cta ææ¡ï¼å°ææ¬ä½å¯ä»¥çç¥
- background ç cropW/cropH æ¯ä¾å¿é å¹éç®æ¨çä½çå¯¬é«æ¯`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: ResizeRequest;
  try {
    body = await context.request.json() as ResizeRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!body.mode || !body.sizes || body.sizes.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Missing mode or sizes' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    let prompt: string;
    const parts: any[] = [];

    if (body.mode === 'crop') {
      const cropBody = body as CropRequest;
      if (!cropBody.image) {
        return new Response(
          JSON.stringify({ error: 'Missing image for crop mode' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      prompt = buildCropPrompt(cropBody.sizes);
      parts.push({
        inlineData: {
          mimeType: cropBody.mimeType || 'image/png',
          data: cropBody.image,
        },
      });
      parts.push({ text: prompt });
    } else if (body.mode === 'compose') {
      const composeBody = body as ComposeRequest;
      if (!composeBody.background || !composeBody.product) {
        return new Response(
          JSON.stringify({ error: 'Missing background or product image for compose mode' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      prompt = buildComposePrompt(
        composeBody.headline || '',
        composeBody.subtitle || '',
        composeBody.cta || '',
        composeBody.sizes
      );
      // Background image
      parts.push({
        inlineData: {
          mimeType: composeBody.backgroundMime || 'image/jpeg',
          data: composeBody.background,
        },
      });
      // Product image
      parts.push({
        inlineData: {
          mimeType: composeBody.productMime || 'image/png',
          data: composeBody.product,
        },
      });
      // Decoration image (optional)
      if (composeBody.decoration) {
        parts.push({
          inlineData: {
            mimeType: composeBody.decorationMime || 'image/png',
            data: composeBody.decoration,
          },
        });
      }
      parts.push({ text: prompt });
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid mode. Use "crop" or "compose".' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiResp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiResp.ok) {
      const errorText = await geminiResp.text();
      console.error('Gemini API error:', geminiResp.status, errorText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${geminiResp.status}`, details: errorText }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResp.json() as any;

    // Extract the text response
    const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      console.error('No text in Gemini response:', JSON.stringify(geminiData).slice(0, 500));
      return new Response(
        JSON.stringify({ error: 'Empty response from Gemini', raw: geminiData }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON from Gemini's response
    let layoutData: any;
    try {
      // Try direct parse first
      layoutData = JSON.parse(textContent);
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        layoutData = JSON.parse(jsonMatch[1].trim());
      } else {
        // Try finding JSON object in the text
        const objMatch = textContent.match(/\{[\s\S]*\}/);
        if (objMatch) {
          layoutData = JSON.parse(objMatch[0]);
        } else {
          throw new Error('Could not extract JSON from response');
        }
      }
    }

    return new Response(JSON.stringify(layoutData), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Resize API error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
