const webpack = require("webpack");
const PrettierPlugin = require("../index.js");
const uuid = require("uuid").v4;
const fs = require("fs");

const sampleCodeFilename = "./__tests__/sample-code.js";
const sampleCode = fs.readFileSync(sampleCodeFilename, { encoding: "utf8" });

const bundle = (config, alternative) => {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err);

      const errors = stats.toString("errors-only");
      if (errors) return reject(errors);

      // If we provided an alternative target, compare it to sample code
      const target = alternative ? alternative : config.entry;
      fs.readFile(target, { encoding: "utf8" }, (err, code) => {
        if (err) return reject(err);

        let didFileUpdate = false;
        if (code !== sampleCode) didFileUpdate = true;
        if (!didFileUpdate) return reject("File did not change!");

        resolve(code);
      });
    });
  });
};

const prepareEntryWithExtras = async (code, extras, file) => {
  return new Promise((resolve, reject) => {
    let fileContents = "";
    extras.forEach(extra => {
      fileContents += extra + "\n";
    });
    fileContents += code;

    fs.writeFile(file, fileContents, err => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const prepareEntry = async (code, file) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(file, code, err => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const teardown = async files =>
  Promise.all(
    files.map(file => {
      return new Promise((resolve, reject) => {
        fs.unlink(file, err => {
          if (err) reject(err);
          else resolve();
        });
      });
    })
  );

describe("unit tests", () => {
  it("prettifies source", async () => {
    const input = `./temp/${uuid()}.js`;
    const output = `./temp/${uuid()}.js`;
    await prepareEntry(sampleCode, input);
    const processed = await bundle({
      entry: input,
      output: { filename: output },
      plugins: [new PrettierPlugin()]
    });
    expect(processed).toMatchSnapshot();
    return teardown([input, output]);
  });

  it("ignores unexpected config options in case they are for prettier", async () => {
    const input = `./temp/${uuid()}.js`;
    const output = `./temp/${uuid()}.js`;
    await prepareEntry(sampleCode, input);
    await bundle({
      entry: input,
      output: { filename: output },
      plugins: [new PrettierPlugin({ maybeForPrettier: true })]
    });
    return teardown([input, output]);
  });

  it("respects prettier config options", async () => {
    const input = `./temp/${uuid()}.js`;
    const output = `./temp/${uuid()}.js`;

    await prepareEntry(sampleCode, input);
    let processed = await bundle({
      entry: input,
      output: { filename: output },
      plugins: [new PrettierPlugin({ singleQuote: true })]
    });
    expect(processed).toMatchSnapshot();

    await prepareEntry(sampleCode, input);
    processed = await bundle({
      entry: input,
      output: { filename: output },
      plugins: [new PrettierPlugin({ singleQuote: false })]
    });
    expect(processed).toMatchSnapshot();

    return teardown([input, output]);
  });

  it("throws on invalid prettier config options", async () => {
    const input = `./temp/${uuid()}.js`;
    const output = `./temp/${uuid()}.js`;

    await prepareEntry(sampleCode, input);
    expect(
      bundle({
        entry: input,
        output: { filename: output },
        plugins: [new PrettierPlugin({ singleQuote: () => null })]
      })
    ).rejects.toMatchSnapshot();

    return teardown([input]);
  });

  it("only processes files with specified extensions", async () => {
    const entry = `./temp/${uuid()}.js`;
    const moduleUUID = uuid();
    const module = `./temp/${moduleUUID}.jsx`;
    const moduleRelativeToEntry = `./${moduleUUID}.jsx`;
    const output = `./temp/${uuid()}.js`;

    await Promise.all([
      prepareEntryWithExtras(
        sampleCode,
        [`const module = require("${moduleRelativeToEntry}")`],
        entry
      ),
      prepareEntry(sampleCode, module)
    ]);

    // Expect the module to not change
    expect(
      bundle(
        {
          entry: entry,
          output: { filename: output },
          plugins: [new PrettierPlugin({ extensions: [".js"] })]
        },
        module
      )
    ).rejects.toMatchSnapshot();

    return teardown([entry, module]);
  });
});
