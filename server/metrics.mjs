const rounded = value => value === null || value === undefined ? null : Math.round(value * 100) / 100;
export const mean = values => values.length ? rounded(values.reduce((a,b) => a+b, 0) / values.length) : null;
export const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b), middle = Math.floor(sorted.length/2);
  return rounded(sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2);
};
export async function metrics(db, eventId) {
  const projects = await db.prepare('SELECT id,anonymous_code,title,scientific_area,status FROM projects WHERE event_id=?').all(eventId);
  const assignments = await db.prepare('SELECT a.* FROM assignments a JOIN projects p ON p.id=a.project_id WHERE p.event_id=?').all(eventId);
  const reviews = await db.prepare('SELECT r.*,a.review_mode,a.reviewer_user_id,a.project_id FROM reviews r JOIN assignments a ON a.id=r.assignment_id JOIN projects p ON p.id=a.project_id WHERE p.event_id=? AND r.submitted_at IS NOT NULL').all(eventId);
  const criteria = await db.prepare('SELECT * FROM rubric_criteria WHERE event_id=? ORDER BY order_index').all(eventId);
  const scoreRows = await db.prepare('SELECT s.* FROM review_scores s JOIN reviews r ON r.id=s.review_id JOIN assignments a ON a.id=r.assignment_id JOIN projects p ON p.id=a.project_id WHERE p.event_id=? AND r.submitted_at IS NOT NULL').all(eventId);
  function summarize(rows) {
    const values = rows.map(r => Number(r.normalized_score));
    const reviewIds = new Set(rows.map(r => r.id));
    return {
      count: rows.length, mean: mean(values), median: median(values),
      reviewers: new Set(rows.map(r => r.reviewer_user_id)).size,
      average_seconds: mean(rows.map(r => Math.max(0, (Date.parse(r.submitted_at)-Date.parse(r.started_at))/1000))),
      distribution: Array.from({length:5},(_,i) => ({label:`${i*20}–${(i+1)*20}`, count:values.filter(v => v >= i*20 && (i===4 ? v<=100 : v<(i+1)*20)).length})),
      criteria: criteria.map(c => ({name:c.name, mean:mean(scoreRows.filter(s => s.criterion_id===c.id && reviewIds.has(s.review_id)).map(s => Number(s.score))), max_score:c.max_score}))
    };
  }
  const anonymous = summarize(reviews.filter(r => r.review_mode==='anonymous'));
  const identified = summarize(reviews.filter(r => r.review_mode==='identified'));
  return {
    ...summarize(reviews), total_projects: projects.length, submitted_projects:projects.filter(p=>p.status!=='draft').length,
    total_reviewers: Number((await db.prepare("SELECT count(*) n FROM users WHERE role='reviewer' AND active=1").get()).n),
    completed:reviews.length, pending:assignments.length-reviews.length,
    progress:assignments.length ? rounded(reviews.length/assignments.length*100) : 0,
    areas: [...new Set(projects.map(p=>p.scientific_area))].map(area=>({label:area,count:projects.filter(p=>p.scientific_area===area).length})),
    ranking:projects.map(p => ({code:p.anonymous_code,title:p.title,mean:mean(reviews.filter(r=>r.project_id===p.id).map(r=>Number(r.normalized_score)))})).filter(p=>p.mean!==null).sort((a,b)=>b.mean-a.mean),
    anonymous, identified, difference: anonymous.mean!==null && identified.mean!==null ? rounded(identified.mean-anonymous.mean) : null
  };
}
