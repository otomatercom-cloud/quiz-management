# -*- coding: utf-8 -*-
{
    "name": "Quiz Management - Students & Leads Bridge",
    "version": "19.0.1.0.0",
    "summary": "Assign students/batches to quizzes and convert quiz registrations into leads",
    "author": "Otomater",
    "website": "https://otomater.com",
    "license": "OPL-1",
    "category": "Education",
    "depends": ["otm_quiz_management", "student_details_19", "custom_leads_19"],
    "data": [
        "security/ir.model.access.csv",
        "views/assign_wizard_views.xml",
        "views/lead_wizard_views.xml",
        "views/bridge_views.xml",
    ],
    "installable": True,
    "application": False,
}
