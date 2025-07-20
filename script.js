// Open the lightbox with the clicked image
function openLightbox(imgElement) {
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightbox-img");

    // Display the full image in the lightbox
    lightboxImg.src = imgElement.src;
    lightbox.style.display = "flex";

    // Add event listener to close the lightbox when the Escape key is pressed
    document.addEventListener("keydown", handleEscape);
}

// Close the lightbox when clicking outside the image or on the close button
function closeLightbox() {
    var lightbox = document.getElementById("lightbox");
    lightbox.style.display = "none";

    // Remove the Escape key event listener when lightbox is closed
    document.removeEventListener("keydown", handleEscape);
}

// Function to handle the Escape key event
function handleEscape(event) {
    if (event.key === "Escape") {
        closeLightbox();
    }
}

// Example news data
const news = [
    { title: "Professional Journey", content: "Expert in railroad safety installation design. Currently coding my very own interlocking." },
    { title: "New Sports Adventure", content: "Part of FlyHigh Lausanne, trying to promote 5v5, indoor or beach." },
    { title: "Upcoming Project", content: "A Frisbee flight simulator!" }
];

// Function to load news dynamically
window.onload = () => {
    const newsContainer = document.getElementById("news-container");

    news.forEach(article => {
        const articleDiv = document.createElement("div");
        articleDiv.classList.add("news-article");

        const articleTitle = document.createElement("h3");
        articleTitle.textContent = article.title;

        const articleContent = document.createElement("p");
        articleContent.textContent = article.content;

        articleDiv.appendChild(articleTitle);
        articleDiv.appendChild(articleContent);

        newsContainer.appendChild(articleDiv);
    });
};

