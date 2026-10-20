import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Mystudents.css";

function MyStudents({ onNavigate }) {

    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    // =========================
    // GET STUDENTS
    // =========================

    useEffect(() => {
        fetchStudents();
    }, []);

    const fetchStudents = async () => {

        setLoading(true);
        setError("");

        const { data, error } = await supabase
            .from("clients")
            .select("*");

        if (error) {
            console.error(error);
            setError(error.message);
        } else {
            const rows = (data || []).map((c) => ({
                ...c,
                id: c.id ?? c.client_no,
                address: c.address ?? c.home_address,
                _key: c.id !== undefined ? "id" : "client_no",
            }));
            rows.sort(
                (a, b) =>
                    new Date(b.created_at || 0) - new Date(a.created_at || 0)
            );
            setStudents(rows);
        }

        setLoading(false);
    };


    // =========================
    // SEARCH STUDENTS
    // =========================

    const filteredStudents = students.filter((student) => {

        const searchText = search.toLowerCase();

        return (
            student.first_name?.toLowerCase().includes(searchText) ||
            student.last_name?.toLowerCase().includes(searchText) ||
            student.email?.toLowerCase().includes(searchText)
        );

    });


    // =========================
    // DELETE STUDENT
    // =========================

    const deleteStudent = async (id) => {

        const confirmDelete = window.confirm(
            "Are you sure you want to remove this student?"
        );

        if (!confirmDelete) {
            return;
        }

        // Works whether your primary key column is "id" or "client_no"
        const student = students.find((s) => s.id === id);
        const keyColumn = student?._key ?? "id";
        const { error } = await supabase
            .from("clients")
            .delete()
            .eq(keyColumn, id);

        if (error) {

            setError(error.message);

        } else {

            setStudents(
                students.filter((student) => student.id !== id)
            );

        }

    };


    return (
        <div className="mentor-page">



            <main className="mentor-content">

                <div className="page-header">

                    <div>

                        <p className="page-label">
                            MENTOR PORTAL
                        </p>

                        <h1>
                            My Students
                        </h1>

                        <p>
                            View and manage the students assigned to you.
                        </p>

                    </div>


                    <button
                        className="refresh-button"
                        onClick={fetchStudents}
                    >
                        Refresh
                    </button>

                </div>


                {/* =========================
                    SEARCH
                ========================= */}

                <div className="student-toolbar">

                    <input
                        type="text"
                        placeholder="Search students..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <span>
                        {filteredStudents.length} students
                    </span>

                </div>


                {/* =========================
                    ERROR
                ========================= */}

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}


                {/* =========================
                    STUDENT TABLE
                ========================= */}

                <div className="students-card">

                    <div className="card-header">

                        <div>

                            <p className="page-label">
                                STUDENT MANAGEMENT
                            </p>

                            <h2>
                                Student List
                            </h2>

                        </div>

                    </div>


                    <div className="table-wrapper">

                        <table>

                            <thead>

                                <tr>

                                    <th>
                                        Name
                                    </th>

                                    <th>
                                        Email
                                    </th>

                                    <th>
                                        ID Number
                                    </th>

                                    <th>
                                        Address
                                    </th>

                                    <th>
                                        Joined
                                    </th>

                                    <th>
                                        Action
                                    </th>

                                </tr>

                            </thead>


                            <tbody>

                                {/* LOADING */}

                                {loading && (

                                    <tr>

                                        <td
                                            colSpan="6"
                                            className="empty-row"
                                        >
                                            Loading students...
                                        </td>

                                    </tr>

                                )}


                                {/* STUDENTS */}

                                {!loading &&
                                    filteredStudents.map((student) => (

                                        <tr key={student.id}>

                                            <td>

                                                <strong>
                                                    {student.first_name}{" "}
                                                    {student.last_name}
                                                </strong>

                                            </td>


                                            <td>
                                                {student.email}
                                            </td>


                                            <td>
                                                {student.id_number || "—"}
                                            </td>


                                            <td>
                                                {student.address || "—"}
                                            </td>


                                            <td>

                                                {student.created_at
                                                    ? new Date(
                                                        student.created_at
                                                    ).toLocaleDateString(
                                                        "en-ZA"
                                                    )
                                                    : "—"}

                                            </td>


                                            <td>

                                                <button
                                                    className="delete-button"
                                                    onClick={() =>
                                                        deleteStudent(student.id)
                                                    }
                                                >
                                                    Remove
                                                </button>

                                            </td>

                                        </tr>

                                    ))
                                }


                                {/* NO STUDENTS */}

                                {!loading &&
                                    filteredStudents.length === 0 && (

                                        <tr>

                                            <td
                                                colSpan="6"
                                                className="empty-row"
                                            >
                                                No students found.
                                            </td>

                                        </tr>

                                    )}

                            </tbody>

                        </table>

                    </div>

                </div>

            </main>

        </div>
    );
}

export default MyStudents;