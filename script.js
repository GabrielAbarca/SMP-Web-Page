const sideMenu = document.querySelector("aside");
const menuBtn = document.querySelector("#menu-btn");
const closeBtn = document.querySelector("#close-btn");
const themeToggler = document.querySelector(".theme-toggler")

menuBtn.addEventListener('click', () => {
    sideMenu.style.display = 'block';
})

closeBtn.addEventListener('click', () => {
    sideMenu.style.display = 'none';
})

themeToggler.addEventListener ('click', () => {
    document.body.classList.toggle('dark-theme-variables');

    themeToggler.querySelector('span:nth-child(1)').classList.toggle('active');
    themeToggler.querySelector('span:nth-child(2)').classList.toggle('active');
})


const Grades = [
    grade = {
        SubjectName: 'Programación Básica',
        ClassWork: '35%',
        Assistance: '10%',
        ExamI: '25%',
        ExamII: '20%',
        HomeWork: '10%',
        Note: '100%'
    },
];

Grades.forEach(grade => {
    const tr = document.createElement('tr');
    const trContent = `
                        <td>${grade.SubjectName}</td>
                        <td>${grade.ClassWork}</td>
                        <td>${grade.Assistance}</td>
                        <td>${grade.ExamI}</td>
                        <td>${grade.ExamII}</td>
                        <td>${grade.HomeWork}</td>
                        <td>${grade.Note}</td>
                        `;
    tr.innerHTML = trContent;
    document.querySelector('table tbody').appendChild(tr);
})