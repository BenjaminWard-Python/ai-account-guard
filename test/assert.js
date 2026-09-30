// Minimal in-page test runner: test(name, fn) then run() renders results.
(function (root) {
  const tests = [];
  root.test = (name, fn) => tests.push({ name, fn });
  root.assert = (cond, msg) => {
    if (!cond) throw new Error(msg || "assertion failed");
  };
  root.assertEqual = (actual, expected, msg) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg || "not equal"}\n  expected: ${e}\n  actual:   ${a}`);
  };
  root.run = async () => {
    const out = document.getElementById("results");
    let failed = 0;
    for (const t of tests) {
      const li = document.createElement("li");
      try {
        await t.fn();
        li.textContent = "PASS  " + t.name;
        li.className = "pass";
      } catch (err) {
        failed++;
        li.textContent = "FAIL  " + t.name + "\n  " + err.message;
        li.className = "fail";
      }
      out.append(li);
    }
    const summary = document.getElementById("summary");
    summary.textContent = `${tests.length - failed}/${tests.length} passed`;
    summary.className = failed ? "fail" : "pass";
    root.testResults = { total: tests.length, failed };
  };
})(globalThis);
