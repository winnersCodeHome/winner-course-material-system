// 執行方式：請確保已安裝 Node.js，然後在專案根目錄下執行: node tests/test_subject_protocol.js
// 或在 tests 目錄下執行: node test_subject_protocol.js

const fs = require('fs');
const path = require('path');

// 根據目前執行路徑自動定位 Code.gs
const codeGsPath = path.join(__dirname, '../Code.gs');
const codeGs = fs.readFileSync(codeGsPath, 'utf8');

// Regex to extract full function definitions (assumes basic syntax match)
function extractFunction(code, funcName) {
  const match = code.match(new RegExp(`function ${funcName}\\s*\\([\\s\\S]*?\\n\\}`));
  if (match) return match[0];

  // alternative robust approach:
  const regex = new RegExp(`function ${funcName}\\s*\\([^)]*\\)\\s*\\{`);
  const startIndex = code.search(regex);
  if (startIndex === -1) return null;

  let braceCount = 0;
  let inString = false;
  let stringChar = null;
  let endIndex = -1;

  for (let i = startIndex; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i-1] : null;

    if ((char === '"' || char === "'" || char === "`") && prevChar !== '\\\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;

      if (braceCount === 0 && char === '}') {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex !== -1) {
    return code.substring(startIndex, endIndex + 1);
  }
  return null;
}

const buildPrintSubjectCode = extractFunction(codeGs, 'buildPrintSubject');
const parsePrintSubjectCode = extractFunction(codeGs, 'parsePrintSubject');

const scriptContext = `
  ${buildPrintSubjectCode}
  ${parsePrintSubjectCode}
  module.exports = { buildPrintSubject, parsePrintSubject };
`;

const moduleObj = { exports: {} };
try {
  const evaluate = new Function('module', scriptContext);
  evaluate(moduleObj);
} catch (e) {
  console.error("載入失敗: ", e);
  process.exit(1);
}

const { buildPrintSubject, parsePrintSubject } = moduleObj.exports;

if (typeof buildPrintSubject !== 'function' || typeof parsePrintSubject !== 'function') {
  console.error("無法正確解析 buildPrintSubject 或 parsePrintSubject");
  process.exit(1);
}

console.log("成功載入測試目標函式");

// 測試案例
const testCases = [
  {
    name: "初印，黑白，純學用本",
    input: {
      materialName: "國三上社會講義",
      isReprint: false,
      colorType: "黑白",
      studentCopies: 21,
      teacherCopies: 0,
      dueDateFormatted: "08/27(四)",
      coverType: "公版封面",
      specialTag: ""
    }
  },
  {
    name: "加印，黑白，學用+教用本",
    input: {
      materialName: "高一下數學講義B2",
      isReprint: true,
      colorType: "黑白",
      studentCopies: 4,
      teacherCopies: 1,
      dueDateFormatted: "07/09(四)",
      coverType: "公版封面",
      specialTag: ""
    }
  },
  {
    name: "初印，彩色，有特殊備註",
    input: {
      materialName: "高二物理講義",
      isReprint: false,
      colorType: "彩色",
      studentCopies: 8,
      teacherCopies: 0,
      dueDateFormatted: "08/20(四)",
      coverType: "公版封面",
      specialTag: "要分隔(藍色)"
    }
  },
  {
    name: "初印，黑白，純教用本",
    input: {
      materialName: "國一英文",
      isReprint: false,
      colorType: "黑白",
      studentCopies: 0,
      teacherCopies: 2,
      dueDateFormatted: "09/01(二)",
      coverType: "自備封面",
      specialTag: ""
    }
  },
  {
    name: "無本數輸入 (預設為學1)",
    input: {
      materialName: "預設本數測試講義",
      isReprint: false,
      colorType: "黑白",
      studentCopies: 0,
      teacherCopies: 0,
      dueDateFormatted: "10/10(四)",
      coverType: "無封面",
      specialTag: "急件"
    }
  },
  {
    name: "包含空白特殊備註",
    input: {
      materialName: "空白備註講義",
      isReprint: true,
      colorType: "彩色/黑白",
      studentCopies: 15,
      teacherCopies: 1,
      dueDateFormatted: "12/25(五)",
      coverType: "公版封面",
      specialTag: "   "
    }
  }
];

let passCount = 0;
const failureList = [];

testCases.forEach((tc, index) => {
  const subject = buildPrintSubject(tc.input);
  const parsed = parsePrintSubject(subject);

  let isConsistent = true;
  const inconsistencies = [];

  // 比對母講義名稱
  if (parsed.materialName !== tc.input.materialName) {
    isConsistent = false;
    inconsistencies.push(`母講義名稱: 預期 ${tc.input.materialName}, 實際 ${parsed.materialName}`);
  }

  // 比對是否加印
  if (parsed.isReprint !== tc.input.isReprint) {
    isConsistent = false;
    inconsistencies.push(`是否加印: 預期 ${tc.input.isReprint}, 實際 ${parsed.isReprint}`);
  }

  // 比對色彩規格
  if (parsed.colorType !== tc.input.colorType) {
    isConsistent = false;
    inconsistencies.push(`色彩規格: 預期 ${tc.input.colorType}, 實際 ${parsed.colorType}`);
  }

  // 比對學用/教用本數
  let expectedStudent = tc.input.studentCopies;
  let expectedTeacher = tc.input.teacherCopies;
  if (expectedStudent === 0 && expectedTeacher === 0) {
    expectedStudent = 1;
  }

  if (parsed.studentCopies !== expectedStudent) {
    isConsistent = false;
    inconsistencies.push(`學用本數: 預期 ${expectedStudent}, 實際 ${parsed.studentCopies}`);
  }
  if (parsed.teacherCopies !== expectedTeacher) {
    isConsistent = false;
    inconsistencies.push(`教用本數: 預期 ${expectedTeacher}, 實際 ${parsed.teacherCopies}`);
  }

  // 比對交件日期
  if (parsed.dueDate !== tc.input.dueDateFormatted) {
    isConsistent = false;
    inconsistencies.push(`交件日期: 預期 ${tc.input.dueDateFormatted}, 實際 ${parsed.dueDate}`);
  }

  // 比對特殊備註
  const expectedSpecialTag = tc.input.specialTag.trim();
  if (parsed.specialTag !== expectedSpecialTag) {
    isConsistent = false;
    inconsistencies.push(`特殊備註: 預期 '${expectedSpecialTag}', 實際 '${parsed.specialTag}'`);
  }

  if (isConsistent) {
    passCount++;
    console.log(`[PASS] Case ${index + 1}: ${tc.name}`);
  } else {
    console.log(`[FAIL] Case ${index + 1}: ${tc.name}`);
    console.log(`       生成的主旨: ${subject}`);
    inconsistencies.forEach(msg => console.log(`       - ${msg}`));
    failureList.push({ name: tc.name, subject, inconsistencies });
  }
});

console.log(`\n==============================`);
console.log(`測試執行結果`);
console.log(`案例數: ${testCases.length}`);
console.log(`通過數: ${passCount}`);
if (failureList.length > 0) {
  console.log(`往返不一致清單:`);
  failureList.forEach(f => {
    console.log(` - ${f.name} (${f.subject})`);
    f.inconsistencies.forEach(inc => console.log(`     ${inc}`));
  });
}
console.log(`==============================\n`);
