// src/getLanguageFromFilePath.ts

export function getLanguageFromFilePath(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
  
    const extensionToLanguageMap: { [key: string]: string } = {
      // Web development languages
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'vue': 'vue',
      'svelte': 'svelte',
      'json': 'json',
      'xml': 'xml',
  
      // Backend and general-purpose languages
      'py': 'python',
      'java': 'java',
      'rb': 'ruby',
      'php': 'php',
      'go': 'go',
      'rs': 'rust',
      'cs': 'csharp',
      'c': 'c',
      'cpp': 'cpp',
      'cxx': 'cpp',
      'cc': 'cpp',
      'kt': 'kotlin',
      'swift': 'swift',
      'scala': 'scala',
      'lua': 'lua',
      'pl': 'perl',
      'pm': 'perl',
      'r': 'r',
      'dart': 'dart',
      'm': 'objectivec',
      'mm': 'objectivecpp',
      'sh': 'bash',
      'bat': 'batchfile',
      'ps1': 'powershell',
      'clj': 'clojure',
      'ex': 'elixir',
      'exs': 'elixir',
      'erl': 'erlang',
      'hs': 'haskell',
      'jl': 'julia',
      'tsv': 'tsv',
      'csv': 'csv',
      'md': 'markdown',
      'txt': 'text',
  
      // Data and configuration formats
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'ini': 'ini',
      'config': 'ini',
      'conf': 'ini',
      'env': 'dotenv',
  
      // Database languages
      'sql': 'sql',
      'psql': 'postgresql',
  
      // Functional and other languages
      'elm': 'elm',
      'fs': 'fsharp',
      'fsx': 'fsharp',
      'ml': 'ocaml',
      'mli': 'ocaml',
      'nim': 'nim',
      'coffee': 'coffeescript',
  
      // Scripting and markup
      'awk': 'awk',
      'groovy': 'groovy',
      'gradle': 'groovy',
      'makefile': 'makefile',
      'mk': 'makefile',
  
      // Shells
      'bash': 'bash',
      'zsh': 'zsh',
      'fish': 'fish',
  
      // Version control and CI/CD
      'gitignore': 'gitignore',
      'dockerfile': 'dockerfile',
      'jenkinsfile': 'groovy',
  
      // Add more mappings as needed
    };
  
    // Handle special filenames without extensions
    const specialFiles: { [key: string]: string } = {
      'makefile': 'makefile',
      'dockerfile': 'dockerfile',
      '.bashrc': 'bash',
      '.bash_profile': 'bash',
      '.zshrc': 'zsh',
      '.gitignore': 'gitignore',
      'jenkinsfile': 'groovy',
    };
  
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  
    if (specialFiles[fileName]) {
      return specialFiles[fileName];
    }
  
    return extensionToLanguageMap[extension] || '';
  }
  