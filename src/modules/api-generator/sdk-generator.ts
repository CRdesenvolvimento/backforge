export function generateSDK(projectId: string, tables: any[]) {
  const sdk = `
class BackForge {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.backforge.com/rest';
  }

  async request(path, method = 'GET', data = null) {
    const response = await fetch(\`\${this.baseUrl}\${path}\`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: data ? JSON.stringify(data) : null
    });
    return response.json();
  }

  ${tables.map(table => `
  // ${table.name}
  async get${table.name}() { return this.request('/${table.name}'); }
  async create${table.name}(data) { return this.request('/${table.name}', 'POST', data); }
  async update${table.name}(id, data) { return this.request('/${table.name}/\${id}', 'PUT', data); }
  async delete${table.name}(id) { return this.request('/${table.name}/\${id}', 'DELETE'); }
  `).join('\n')}
}

export default BackForge;
  `;
  return sdk;
}
