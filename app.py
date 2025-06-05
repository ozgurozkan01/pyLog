from flask import Flask, render_template, jsonify, request
import db_manager 
import json 

app = Flask(__name__)

@app.route('/')
def index():
    dashboard_data = db_manager.get_dashboard_data()
    recent_logs, _ = db_manager.get_logs_from_db(limit=5)
    return render_template('index.html', dashboard_data=dashboard_data, recent_logs=recent_logs)

@app.route('/api/logs', methods=['GET'])
def api_get_logs():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    offset = (page - 1) * per_page

    filters = {}
    if request.args.get('priority'):
        filters['priority'] = request.args.get('priority')
    if request.args.get('identifier'):
        filters['identifier'] = request.args.get('identifier')
    if request.args.get('hostname'):
        filters['hostname'] = request.args.get('hostname')
    if request.args.get('message'):
        filters['message'] = request.args.get('message')
    if request.args.get('global_search'):
        filters['global_search'] = request.args.get('global_search')


    logs, total_logs = db_manager.get_logs_from_db(limit=per_page, offset=offset, filters=filters)

    processed_logs = []
    for log in logs:
        processed_log = dict(log)
        try:
            raw_data = json.loads(log.get('raw_log', '{}'))
            processed_log['_SYSTEMD_UNIT'] = raw_data.get('_SYSTEMD_UNIT')
            processed_log['_COMM'] = raw_data.get('_COMM')
            processed_log['_BOOT_ID'] = raw_data.get('_BOOT_ID')
            processed_log['__CURSOR'] = raw_data.get('__CURSOR')

        except json.JSONDecodeError:
            pass
        processed_logs.append(processed_log)


    return jsonify({
        'logs': processed_logs,
        'total_logs': total_logs,
        'page': page,
        'per_page': per_page,
        'total_pages': (total_logs + per_page - 1) // per_page
    })

@app.route('/api/dashboard-data')
def api_dashboard_data():
    data = db_manager.get_dashboard_data()
    return jsonify(data)


if __name__ == '__main__':
    app.run(debug=True)