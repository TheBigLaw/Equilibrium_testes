document.addEventListener("DOMContentLoaded", () => {
    // --- Lógica de Navegação das Abas ---
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove a classe 'active' de todos os botões e conteúdos
            tabBtns.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            // Adiciona a classe 'active' no botão clicado
            btn.classList.add("active");
            
            // Pega o ID do conteúdo alvo e mostra na tela
            const targetId = btn.getAttribute("data-target");
            document.getElementById(targetId).classList.add("active");
        });
    });

    // --- Lógica dos Checkboxes e Datas ---
    const checkboxes = document.querySelectorAll(".check-teste");

    checkboxes.forEach(checkbox => {
        checkbox.addEventListener("change", function() {
            // Encontra a linha (tr) correspondente e o input de data dentro dela
            const tr = this.closest("tr");
            const dataInput = tr.querySelector(".input-data");
            
            if (this.checked) {
                // Habilita o campo de data
                dataInput.disabled = false;
                
                // Preenche com a data atual no formato aceito pelo input type="date" (YYYY-MM-DD)
                const hoje = new Date().toISOString().split("T")[0];
                dataInput.value = hoje;
                
                // Destaca levemente a linha selecionada em verde claro
                tr.style.backgroundColor = "rgba(67, 160, 71, 0.05)"; 
            } else {
                // Desabilita, limpa a data e remove o destaque se desmarcar
                dataInput.disabled = true;
                dataInput.value = "";
                tr.style.backgroundColor = ""; 
            }
        });
    });
});
