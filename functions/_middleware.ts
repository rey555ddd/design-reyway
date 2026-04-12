// CORS middleware for design.reyway.com
const allowedOrigins = [
  'https://design.reyway.com',
  'https://design-reyway.pages.dev',
  'http://localhost:8788',
  'http://localhost:3000',
];

export const onRequest: PagesFunction = async (context) => {
  const origin = context.request.headers.get('Origin') || '';
  const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.design-reyway.pages.dev');

  // Handle preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': isAllowed ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const response = await context.next();
  const newResponse = new Response(response.body, response);

  if (isAllowed) {
    newResponse.headers.set('Access-Control-Allow-Origin', origin);
  }

  return newResponse;
};
