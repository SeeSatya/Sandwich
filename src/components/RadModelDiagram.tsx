import React from 'react';
import { AppTheme } from '../types';
import { getDiagramEdgeColor } from '../diagrams/colors';

const RadModelDiagram: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const edgeColor = getDiagramEdgeColor(theme.isDark);

  return (
  <div
    className="mermaid-container my-6 w-full overflow-hidden rounded-3xl p-4"
    style={{
      backgroundColor: theme.isDark ? `${theme.colors.codeBackground}80` : 'rgba(248, 250, 252, 0.5)',
      border: `1px solid ${theme.isDark ? theme.colors.border : '#f1f5f9'}`
    }}
  >
    <svg
      viewBox="0 0 1035 500"
      role="img"
      aria-label="RAD model diagram showing requirements planning, construction, cutover, improvements, user feedback, and user design"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto', maxHeight: 680 }}
    >
      <g fill="none" stroke={edgeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M608 173 V237" />
        <path d="M345 323 V347 H756 V363" />
        {/* Construction iterates directly with User Design. The Improvements
            pill sits over the middle of this dashed route in the reference. */}
        <path d="M656 173 V221 H803 V363" strokeDasharray="4 4" />
        <path d="M849 373 V198 Q849 188 839 188 H714 Q704 188 704 178 V183" />
        <path d="M680 411 H700" strokeDasharray="3 3" />
      </g>

      {/* Filled arrowheads stay legible when the diagram is scaled down in the
          preview and remain part of the SVG when it is paginated or exported. */}
      <g fill={edgeColor} stroke={edgeColor} strokeWidth="1" strokeLinejoin="round">
        <path d="M608 237 L600 223 L616 223 Z" />
        <path d="M756 363 L748 349 L764 349 Z" />
        <path d="M803 363 L795 349 L811 349 Z" />
        <path d="M704 183 L696 197 L712 197 Z" />
        <path d="M700 411 L686 403 L686 419 Z" />
      </g>

      <g fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" fontSize="16" fontWeight="600" textAnchor="middle" fill="#99ceff">
        <rect x="560" y="98" width="192" height="75" rx="20" fill="#00284d" stroke="#1f4e94" />
        <text x="656" y="142">Construction</text>

        <rect x="208" y="248" width="275" height="75" rx="20" fill="#00284d" stroke="#1f4e94" />
        <text x="345.5" y="292">Requirements Planning</text>

        <rect x="532" y="248" width="153" height="75" rx="20" fill="#00284d" stroke="#1f4e94" />
        <text x="608.5" y="292">Cutover</text>

        <rect x="710" y="373" width="186" height="75" rx="20" fill="#00284d" stroke="#1f4e94" />
        <text x="803" y="417">User Design</text>
      </g>

      <g fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" fontSize="16" fontWeight="600" textAnchor="middle" fill="#99ceff">
        <rect x="735" y="269" width="136" height="34" rx="17" fill="#000e1a" stroke="#1a3e5f" />
        <text x="803" y="292">Improvements</text>

        <rect x="544" y="394" width="136" height="34" rx="17" fill="#000e1a" stroke="#1a3e5f" />
        <text x="612" y="417">User Feedback</text>
      </g>
    </svg>
  </div>
  );
};

export default RadModelDiagram;
