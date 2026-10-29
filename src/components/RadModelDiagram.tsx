import React from 'react';
import { AppTheme } from '../types';

const RadModelDiagram: React.FC<{ theme: AppTheme }> = ({ theme }) => (
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
      <defs>
        <marker id="rad-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#b0b0b0" />
        </marker>
      </defs>

      <g fill="none" stroke="#b0b0b0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M608 173 V237" markerEnd="url(#rad-arrow)" />
        <path d="M345 323 V347 H756 V373" markerEnd="url(#rad-arrow)" />
        <path d="M656 173 V221 H803 V269" strokeDasharray="4 4" markerEnd="url(#rad-arrow)" />
        <path d="M803 303 V373" strokeDasharray="4 4" markerEnd="url(#rad-arrow)" />
        <path d="M849 373 V198 Q849 188 839 188 H714 Q704 188 704 178 V173" markerEnd="url(#rad-arrow)" />
        <path d="M680 411 H710" strokeDasharray="3 3" markerEnd="url(#rad-arrow)" />
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

export default RadModelDiagram;
