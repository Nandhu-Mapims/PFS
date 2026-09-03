#!/bin/sh
# Run on the VPS host (not inside the container).
# Scans every database in the pfs_mongo container for HTML-tagged patientName values.
set -e

CONTAINER="pfs_mongo"

echo "=== databases in $CONTAINER ==="
docker exec "$CONTAINER" mongosh --quiet --eval '
db.adminCommand({listDatabases:1}).databases.forEach(d => print(d.name));
'

echo ""
echo "=== scanning each db for feedbacks.patientName with HTML tags ==="
docker exec "$CONTAINER" mongosh --quiet --eval '
db.adminCommand({listDatabases:1}).databases
  .map(d => d.name)
  .filter(n => !["admin","config","local"].includes(n))
  .forEach(function (dbName) {
    var d = db.getSiblingDB(dbName);
    if (!d.getCollectionNames().includes("feedbacks")) return;
    var total = d.feedbacks.countDocuments({});
    var tagged = d.feedbacks.countDocuments({ patientName: { $regex: "<[a-zA-Z]" } });
    print(dbName + "  total=" + total + "  html_tagged_patientName=" + tagged);
    if (tagged > 0) {
      d.feedbacks.find(
        { patientName: { $regex: "<[a-zA-Z]" } },
        { patientName: 1, patientRegNo: 1, submissionMode: 1, createdAt: 1, ticketId: 1 }
      ).limit(10).forEach(doc => printjson(doc));
    }
  });
'
