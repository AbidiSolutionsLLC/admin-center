import axios from 'axios';

async function verifyFix() {
  const url = 'http://localhost:5000/api/v1/people/invite';
  const payload = {
    full_name: 'tayyab gg',
    email: 'tsaleem@abidisolutions.com',
    employment_type: 'full_time',
    department_id: '69d3c3988aacb9579ca4501b'
  };

  try {
    console.log('Sending invite for existing user...');
    // We don't have a valid JWT here easily, but we can see if it hits the controller
    // or if it fails with 401. If it fails with 401, we at least know the route is there.
    // To really test the 400, I'd need a token.
    
    // Instead, I'll check the server logs if possible.
    const response = await axios.post(url, payload);
    console.log('Response:', response.data);
  } catch (error: any) {
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error Body:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

verifyFix();
