# Pantry Party

A collaborative recipe generation web app built with Astro.

## Features

- **Collaborative Sessions**: Create or join cooking sessions with friends
- **AI-Powered Recipes**: Generate recipes using OpenAI based on available ingredients
- **Real-time Collaboration**: Share ingredients and vote on recipes together
- **Smart Context**: Add cooking context for better recipe suggestions
- **Ingredient Management**: Add, blacklist, and manage ingredients collaboratively
- **PWA Support**: Install as a Progressive Web App for offline use
- **Privacy-First**: Your OpenAI API keys stay local, never sent to our servers

## Getting Started

### Prerequisites

- Node.js 18+ 
- An OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pantry-party
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:4321`

### Building for Production

```bash
npm run build
npm run preview
```

## How to Use

1. **Create a Session**: 
   - Enter your name and OpenAI API key
   - Click "Create Session" to start a new cooking session
   - Share the session code with friends

2. **Join a Session**:
   - Enter your name and the session code
   - Optionally add your OpenAI API key to generate recipes

3. **Add Ingredients**:
   - Add ingredients you have available
   - Blacklist ingredients you want to avoid
   - Ingredients are shared with all session participants

4. **Set Context**:
   - Add cooking context like "grilling", "dessert", "quick lunch"
   - This helps the AI generate more relevant recipes

5. **Generate Recipes**:
   - Click "Generate Recipe" to create AI-powered suggestions
   - Vote on recipes with other participants
   - Filter and sort recipes by various criteria

## Architecture

- **Frontend**: Astro with minimal JavaScript (Astro Islands)
- **Storage**: localStorage for session persistence
- **AI Integration**: Client-side OpenAI API calls
- **PWA**: Service worker for offline caching
- **Real-time**: WebSocket support (coming soon)

## API Keys & Privacy

- OpenAI API keys are stored locally in your browser
- Keys are never transmitted to or stored on our servers
- All AI requests are made directly from your browser to OpenAI
- This ensures your API usage and costs are under your control

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details