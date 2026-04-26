const fs = require('fs');
const path = 'src/mixins/actions.js';
let content = fs.readFileSync(path, 'utf8');

// Update call (already done but safe to repeat)
content = content.replace(
  /case 'debt_manage': return this\._handleDebtManage\(pid, decision, spaceId\);/,
  "case 'debt_manage': return this._handleDebtManage(pid, decision, spaceId, data);"
);

// Update definition (already done but safe to repeat)
content = content.replace(
  /_handleDebtManage\(pid, decision, spaceId\) \{/,
  "_handleDebtManage(pid, decision, spaceId, data) {"
);

// Update body with regex to handle CRLF/LF
content = content.replace(
  /if \(decision === 'sell_property'\) \{\r?\n\s+this\._sellProperty\(pid, spaceId\);/,
  `if (decision === 'sell_property' || decision === 'sell_batch') {
      if (decision === 'sell_batch' && Array.isArray(data?.spaceIds)) {
        this._sellMultipleProperties(pid, data.spaceIds);
      } else {
        this._sellProperty(pid, spaceId);
      }`
);

fs.writeFileSync(path, content);
console.log('Success');
