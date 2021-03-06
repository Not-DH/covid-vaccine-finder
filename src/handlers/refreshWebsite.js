const execa = require("execa");
const _ = require("lodash");
const fs = require("fs").promises;
const os = require("os");
const stringify = require("json-stable-stringify");
const del = require("del");
const ghpages = require("gh-pages");
const util = require("util");
const logger = require("../logger");
const getDatabase = require("../getDatabase");
const { Store } = require("../models/Store");

const publish = util.promisify(ghpages.publish);

module.exports.refreshWebsite = async () => {
  const db = await getDatabase();
  const {
    container: albertsonsStores,
  } = await db.containers.createIfNotExists({ id: "albertsons_stores" });
  const { container: krogerStores } = await db.containers.createIfNotExists({
    id: "kroger_stores",
  });
  const { container: pharmacaStores } = await db.containers.createIfNotExists({
    id: "pharmaca_stores",
  });
  const { container: walgreensStores } = await db.containers.createIfNotExists({
    id: "walgreens_stores",
  });
  const { container: walmartStores } = await db.containers.createIfNotExists({
    id: "walmart_stores",
  });

  const { stdout } = await execa("ls", ["-lh", os.tmpdir()]);
  logger.info(stdout);
  await del([`${os.tmpdir()}/covid-vaccine-finder*`], { force: true });
  const tmp = await fs.mkdtemp(`${os.tmpdir()}/covid-vaccine-finder`);
  logger.info(tmp);
  await execa("cp", ["-r", "./site", `${tmp}/`]);
  await execa("mkdir", ["-p", `${tmp}/site/_data`]);

  const storeSelect = [
    "id",
    "brand",
    "brand_id",
    "name",
    "address",
    "city",
    "state",
    "postal_code",
    "appointments",
    "appointments_available",
    "appointments_last_fetched",
    "appointments_raw",
  ];

  const { resources: albertsonsData } = await albertsonsStores.items
    .query("SELECT * from c WHERE c.clientName != null ORDER BY c.id")
    .fetchAll();
  await fs.writeFile(
    `${tmp}/site/_data/albertsons.json`,
    stringify(albertsonsData, { space: "  " })
  );

  try {
    const cvsData = await Store.query()
      .select(storeSelect)
      .where("brand", "cvs")
      .orderBy("id");
    await fs.writeFile(
      `${tmp}/site/_data/cvs.json`,
      stringify(_.groupBy(cvsData, "state"), { space: "  " })
    );
  } catch (err) {
    logger.info("CVS Data Error: ", err);
  }

  const { resources: krogerData } = await krogerStores.items
    .query("SELECT * from c ORDER BY c.id")
    .fetchAll();
  await fs.writeFile(
    `${tmp}/site/_data/kroger.json`,
    stringify(krogerData, { space: "  " })
  );

  const { resources: pharmacaData } = await pharmacaStores.items
    .query(
      "SELECT * from c WHERE c.state = 'Colorado' OR c.state = 'CO' ORDER BY c.id"
    )
    .fetchAll();
  await fs.writeFile(
    `${tmp}/site/_data/pharmaca.json`,
    stringify(pharmacaData, { space: "  " })
  );

  try {
    const samsClubData = await Store.query()
      .select(storeSelect)
      .where("brand", "sams_club")
      .orderBy("id");
    await fs.writeFile(
      `${tmp}/site/_data/samsClub.json`,
      stringify(_.groupBy(samsClubData, "state"), { space: "  " })
    );
  } catch (err) {
    logger.error("Sam's Club Data Error: ", err);
  }

  const { resources: walgreensData } = await walgreensStores.items
    .query("SELECT * from c ORDER BY c.id")
    .fetchAll();
  await fs.writeFile(
    `${tmp}/site/_data/walgreens.json`,
    stringify(walgreensData, { space: "  " })
  );

  const { resources: walmartData } = await walmartStores.items
    .query("SELECT * from c ORDER BY c.id")
    .fetchAll();
  await fs.writeFile(
    `${tmp}/site/_data/walmart.json`,
    stringify(walmartData, { space: "  " })
  );

  await execa("./node_modules/@11ty/eleventy/cmd.js", [
    "--input",
    `${tmp}/site`,
    "--output",
    `${tmp}/_site`,
  ]);
  await execa("cp", ["-r", `${tmp}/site/_data`, `${tmp}/_site/`]);
  await execa("./node_modules/gh-pages/bin/gh-pages-clean.js");

  await publish(`${tmp}/_site`, {
    repo: `https://${process.env.GH_TOKEN}@github.com/GUI/vaccine.git`,
    dotfiles: true,
    silent: false,
    user: {
      name: "Auto Builder",
      email: "12112+GUI@users.noreply.github.com",
    },
  });

  // await Store.knex().destroy();
};

// module.exports.refreshWebsite();
