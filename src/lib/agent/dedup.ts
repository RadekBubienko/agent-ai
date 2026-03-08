export async function findDuplicate(db:any, lead:any) {

  if (lead.email) {
    const [rows] = await db.query(
      "SELECT id FROM leads WHERE email = ? LIMIT 1",
      [lead.email]
    )

    if (rows.length) return rows[0].id
  }

  if (lead.website) {
    const [rows] = await db.query(
      "SELECT id FROM leads WHERE website = ? LIMIT 1",
      [lead.website]
    )

    if (rows.length) return rows[0].id
  }

  const [rows] = await db.query(
    "SELECT id FROM leads WHERE name = ? LIMIT 1",
    [lead.name]
  )

  if (rows.length) return rows[0].id

  return null
}