import { readFileSync } from 'node:fs';

// The user's complete copied stylesheet, with labels appended as in their
// Markdown. Expected topology lives only in verification fixtures.
const css = readFileSync(new URL('./chatgpt-flowchart.css', import.meta.url), 'utf8').trim();
export const copiedDiagrams = [
  {
    heading: '3. Diagram of Rule-Based System',
    prose: '',
    labels: 'User InputUser InterfaceWorking MemoryKnowledge BaseInference EngineDecision / ResultUser Output',
    edges: [
      ['Knowledge Base', 'Inference Engine'], ['User Input', 'User Interface'],
      ['Inference Engine', 'Decision / Result'], ['Decision / Result', 'User Interface'],
      ['User Interface', 'Working Memory'], ['Working Memory', 'Inference Engine'],
      ['User Interface', 'User Output'],
    ],
  },
  {
    heading: '5. Working of Intelligent Machines and Smart Systems',
    prose: 'Both intelligent machines and smart systems use data and technology to perform intelligent tasks.',
    labels: 'EnvironmentSensors / Data CollectionData ProcessingAI / Decision MakingAction / ResponseFeedback',
    edges: [
      ['Environment', 'Sensors / Data Collection'], ['Sensors / Data Collection', 'Data Processing'],
      ['Data Processing', 'AI / Decision Making'], ['AI / Decision Making', 'Action / Response'],
      ['Action / Response', 'Feedback'], ['Feedback', 'Sensors / Data Collection'],
    ],
  },
  {
    heading: '4. Relationship Between Intelligence and AI',
    prose: 'Artificial Intelligence is inspired by human intelligence. It tries to develop machines that can perform tasks such as learning, reasoning, understanding, and problem-solving.\n\nThe main goal is not necessarily to make machines exactly like humans, but to make them capable of performing intelligent tasks efficiently.',
    labels: 'IntelligenceLearningReasoningProblem SolvingDecision MakingArtificial IntelligenceIntelligent Machines',
    edges: [
      ['Intelligence', 'Learning'], ['Intelligence', 'Reasoning'],
      ['Intelligence', 'Problem Solving'], ['Intelligence', 'Decision Making'],
      ['Learning', 'Artificial Intelligence'], ['Reasoning', 'Artificial Intelligence'],
      ['Problem Solving', 'Artificial Intelligence'], ['Decision Making', 'Artificial Intelligence'],
      ['Artificial Intelligence', 'Intelligent Machines'],
    ],
  },
].map((fixture, index) => ({
  ...fixture,
  markdown: `### ${fixture.heading}\n\n${fixture.prose ? fixture.prose + '\n\n' : ''}${css.replaceAll('r_jp', ['r_jp', 'r_jl', 'r_if'][index])}${fixture.labels}`,
}));
