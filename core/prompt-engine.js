/**
 * Meta Automator – AI Prompt Engine
 * Built-in prompt idea generator with categorized templates.
 */
const PromptEngine = {
  categories: {
    photography: {
      name: '📷 Photography',
      templates: [
        'A cinematic portrait of {subject} in golden hour lighting, shot on 35mm film',
        'An aerial drone photograph of {location} at sunrise, ultra detailed',
        'A macro photography shot of {object} with bokeh background, studio lighting',
        'Street photography of {scene} in the rain, reflections on wet pavement, moody',
        'A black and white portrait of {subject} with dramatic shadows, high contrast'
      ]
    },
    fantasy: {
      name: '🧙 Fantasy & Sci-Fi',
      templates: [
        'An enchanted {location} with glowing mushrooms and floating crystals, magical atmosphere',
        'A cyberpunk cityscape at night with neon signs and flying cars, rain-soaked streets',
        'A majestic dragon perched on a mountain peak, epic fantasy landscape, volumetric lighting',
        'An underwater alien civilization with bioluminescent architecture, deep ocean',
        'A steampunk airship flying over Victorian London, detailed gears and brass, sunset'
      ]
    },
    nature: {
      name: '🌿 Nature & Landscapes',
      templates: [
        'A breathtaking view of {location} during autumn, golden leaves, misty morning',
        'Northern lights dancing over a frozen lake in Iceland, stars visible, long exposure',
        'A tropical waterfall hidden in dense jungle, sunbeams through canopy, crystal clear water',
        'Rolling hills of lavender fields in Provence at sunset, warm golden light',
        'A serene Japanese garden in spring with cherry blossoms falling, koi pond reflection'
      ]
    },
    product: {
      name: '📦 Product & Commercial',
      templates: [
        'A luxury {product} floating in mid-air with dramatic studio lighting, dark background',
        'Flat lay photography of {product} surrounded by complementary items, pastel background',
        'A {product} in a lifestyle setting, natural lighting, minimalist Scandinavian interior',
        'Close-up product shot of {product} with water droplets, fresh and clean aesthetic',
        'A {product} advertisement with gradient background, professional studio lighting'
      ]
    },
    abstract: {
      name: '🎨 Abstract & Artistic',
      templates: [
        'Abstract fluid art with vibrant {colors}, metallic gold accents, 4K resolution',
        'Geometric patterns inspired by Islamic art, intricate details, gold and deep blue',
        'A surrealist painting in the style of Salvador Dali, melting {objects}, dreamscape',
        'Generative art with fractal patterns, neon colors on dark background, digital art',
        'Watercolor painting of {subject}, soft edges, bleeding colors, artistic composition'
      ]
    },
    social: {
      name: '📱 Social Media',
      templates: [
        'Instagram-worthy flat lay of {items} on marble surface, aesthetic arrangement',
        'A motivational quote background with {theme} scenery, elegant typography space',
        'Thumbnail design background with bold {colors} gradient, dynamic composition',
        'Story-sized vertical image of {scene} with space for text overlay, trendy aesthetic',
        'A collage-style mood board with {theme} elements, Pinterest aesthetic'
      ]
    },
    character: {
      name: '👤 Character Design',
      templates: [
        'A detailed character portrait of a {description}, fantasy RPG style, concept art',
        'An anime-style character with {features}, dynamic pose, vibrant colors',
        'A realistic 3D render of a {description} character, Unreal Engine quality',
        'Pixel art character sprite of a {description}, retro gaming style, 16-bit',
        'A comic book style hero with {powers}, action pose, bold ink lines'
      ]
    },
    architecture: {
      name: '🏛️ Architecture',
      templates: [
        'A futuristic skyscraper with vertical gardens, sustainable design, golden hour',
        'An ancient {style} temple ruins overgrown with vegetation, atmospheric fog',
        'Modern minimalist house with floor-to-ceiling windows, mountain backdrop, twilight',
        'A cozy cabin in a snowy forest, warm light from windows, smoke from chimney',
        'Art deco building facade with geometric details, vintage color palette, dramatic angle'
      ]
    }
  },

  getCategories() {
    return Object.entries(this.categories).map(([key, cat]) => ({
      id: key,
      name: cat.name,
      count: cat.templates.length
    }));
  },

  getPrompts(categoryId) {
    const cat = this.categories[categoryId];
    return cat ? cat.templates : [];
  },

  getAllPrompts() {
    const all = [];
    for (const cat of Object.values(this.categories)) {
      all.push(...cat.templates);
    }
    return all;
  },

  getRandomPrompts(count = 5) {
    const all = this.getAllPrompts();
    const shuffled = all.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  },

  fillTemplate(template, replacements = {}) {
    let filled = template;
    for (const [key, value] of Object.entries(replacements)) {
      filled = filled.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return filled;
  }
};

if (typeof window !== 'undefined') { window.PromptEngine = PromptEngine; }
